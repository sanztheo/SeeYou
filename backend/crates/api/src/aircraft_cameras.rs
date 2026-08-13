//! `GET /aircraft/:icao/cameras` (SeeYou v2 P2, Lot 6) — which cameras see
//! this aircraft now, and which will see it soon.
//!
//! Reuses the Lot 1 predictor (the same `SharedPredictor` backing
//! `GET /aircraft/:icao/predict`) instead of reading a raw cached position:
//! `trajectory.points[0]` (one `STEP_SECS` ahead of the predictor's internal
//! state) stands in for "now", and later points stand in for the future
//! window. At this system's ADS-B refresh cadence (12-58s, see
//! `resultats-lot0-lot1.md`), a few seconds of forward projection is a
//! tighter "now" than the last raw fix, not a looser one — there is no
//! fresher position anywhere in the system to fall back to.
//!
//! All camera-domain geometry (bearing/elevation/FOV cone/pixel criterion)
//! lives in `cameras::visibility`; this handler only orchestrates: fetch
//! the trajectory, fetch cameras + nearest METAR reading, spatially
//! pre-filter, call into the domain crate per (camera, point) pair, and
//! shape the response.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use cache::RedisPool;
use cameras::visibility::{self, CameraAssessment, CameraIndex, OpticalLevel, WeatherContext};
use cameras::Camera;
use prediction::service::SharedPredictor;
use serde::{Deserialize, Serialize};

/// Fixed prediction window for this endpoint (no query params — the
/// horizon/step tradeoff is an internal implementation detail, not
/// something callers need to tune). 3-minute horizon at 3s steps (60
/// points) is fine enough not to skip a narrow FOV window even for a fast
/// low-altitude flyby (~260 m/s covers ~780 m per step, well under typical
/// camera ranges of a few km).
const HORIZON_SECS: f64 = 180.0;
const STEP_SECS: f64 = 3.0;

/// Nearest-METAR-station search radius. Weather is sampled once, at the
/// aircraft's current position, and reused for every candidate camera in
/// the window — those cameras are all within a few km of the aircraft by
/// construction (bounded by `visibility::max_possible_range_km`), so
/// weather doesn't meaningfully vary across them.
const MAX_METAR_STATION_KM: f64 = 150.0;

#[derive(Debug, Clone, Serialize)]
pub struct CameraSighting {
    pub camera_id: String,
    pub camera_name: String,
    pub source: String,
    pub level: OpticalLevel,
    /// 0-1, blends optical level with weather confidence.
    pub score: f64,
    pub geometry: visibility::SightingGeometry,
    pub explain: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PredictedCameraSighting {
    pub camera_id: String,
    pub camera_name: String,
    pub source: String,
    /// Best (highest-score) optical level reached during the window.
    pub level: OpticalLevel,
    /// Seconds from now until this camera first sees the aircraft.
    pub t_minus_secs: f64,
    /// How long the window lasts, in seconds.
    pub duration_secs: f64,
    /// Geometry snapshot at the window's best (highest-score) point.
    pub geometry: visibility::SightingGeometry,
    pub explain: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterReason {
    /// The aircraft stays above `visibility::CRUISE_ALTITUDE_CUTOFF_M` for
    /// the whole predicted window — no roadside/urban camera can resolve
    /// it, so it's filtered upstream rather than returning a hollow (but
    /// technically non-empty-looking) empty result.
    CruiseAltitude,
}

#[derive(Debug, Clone, Serialize)]
pub struct AircraftCamerasResponse {
    pub icao: String,
    /// "imm" (tracked military) or "cv_coldstart" (everything else) — passed
    /// through from the predictor, same honesty contract as `/predict`.
    pub model: String,
    pub current_altitude_m: f64,
    pub seeing_now: Vec<CameraSighting>,
    pub will_see: Vec<PredictedCameraSighting>,
    pub filtered_reason: Option<FilterReason>,
    /// Top-level honesty notes: cruise filtering, missing weather data,
    /// proximity-only sightings from cameras with no reliable heading.
    pub notes: Vec<String>,
}

/// Subset of `ws::MetarStation`'s JSON shape — deserialized locally so this
/// crate doesn't need a `ws` dependency just to read four fields out of the
/// `metar:all` cache blob.
#[derive(Debug, Deserialize)]
struct CachedMetarStation {
    lat: f64,
    lon: f64,
    visibility_m: Option<f64>,
    ceiling_ft: Option<u32>,
}

/// Nearest cached METAR reading to `(lat, lon)`, plus an explanatory note
/// when none is usable (no cache yet, or nothing within
/// `MAX_METAR_STATION_KM`). Never fails the request — weather is a soft
/// confidence signal, not a hard dependency.
async fn nearest_weather(pool: &RedisPool, lat: f64, lon: f64) -> (WeatherContext, Option<String>) {
    let stations: Vec<CachedMetarStation> = match cache::metar::get_metar(pool).await {
        Ok(Some(s)) if !s.is_empty() => s,
        _ => {
            return (
                WeatherContext::default(),
                Some("no METAR data cached — weather confidence not applied".to_string()),
            );
        }
    };

    let nearest = stations
        .iter()
        .map(|s| (visibility::haversine_distance_m(lat, lon, s.lat, s.lon), s))
        .min_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(Ordering::Equal));

    match nearest {
        Some((dist_m, station)) if dist_m <= MAX_METAR_STATION_KM * 1000.0 => (
            WeatherContext {
                visibility_m: station.visibility_m,
                ceiling_ft: station.ceiling_ft.map(f64::from),
            },
            None,
        ),
        _ => (
            WeatherContext::default(),
            Some(format!(
                "no METAR station within {MAX_METAR_STATION_KM:.0} km of the aircraft — weather confidence not applied"
            )),
        ),
    }
}

/// An in-progress (or just-closed) "will see" window for one camera:
/// tracks the point range and the best (highest-score) assessment seen so
/// far, so the reported geometry/level reflects the best moment, not the
/// marginal entry moment.
struct RunState {
    start_idx: usize,
    end_idx: usize,
    best: CameraAssessment,
}

impl RunState {
    fn new(idx: usize, assessment: CameraAssessment) -> Self {
        Self {
            start_idx: idx,
            end_idx: idx,
            best: assessment,
        }
    }

    fn extend(&mut self, idx: usize, assessment: CameraAssessment) {
        self.end_idx = idx;
        if assessment.score > self.best.score {
            self.best = assessment;
        }
    }

    fn into_sighting(self, camera: &Camera, step_secs: f64) -> PredictedCameraSighting {
        let t_minus_secs = self.start_idx as f64 * step_secs;
        let duration_secs = (self.end_idx - self.start_idx + 1) as f64 * step_secs;
        PredictedCameraSighting {
            camera_id: camera.id.clone(),
            camera_name: camera.name.clone(),
            source: camera.source.clone(),
            level: self.best.level,
            t_minus_secs,
            duration_secs,
            geometry: self.best.geometry,
            explain: self.best.explain,
        }
    }
}

fn to_camera_sighting(camera: &Camera, assessment: &CameraAssessment) -> CameraSighting {
    CameraSighting {
        camera_id: camera.id.clone(),
        camera_name: camera.name.clone(),
        source: camera.source.clone(),
        level: assessment.level,
        score: assessment.score,
        geometry: assessment.geometry.clone(),
        explain: assessment.explain.clone(),
    }
}

/// GET /aircraft/:icao/cameras
pub async fn get_aircraft_cameras(
    Path(icao): Path<String>,
    State(predictor): State<SharedPredictor>,
    State(redis_pool): State<RedisPool>,
) -> Result<Json<AircraftCamerasResponse>, (StatusCode, String)> {
    let trajectory = {
        let guard = predictor.read().await;
        guard.get_trajectory(&icao, HORIZON_SECS, STEP_SECS)
    };
    let trajectory = trajectory.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            format!("aircraft {icao} is not currently tracked"),
        )
    })?;

    let Some(now_point) = trajectory.points.first() else {
        return Err((
            StatusCode::NOT_FOUND,
            "predictor returned no points".to_string(),
        ));
    };
    let current_altitude_m = now_point.alt_m;
    let now_lat = now_point.lat;
    let now_lon = now_point.lon;

    let any_low_altitude = trajectory
        .points
        .iter()
        .any(|p| p.alt_m <= visibility::CRUISE_ALTITUDE_CUTOFF_M);

    if !any_low_altitude {
        return Ok(Json(AircraftCamerasResponse {
            icao,
            model: trajectory.model,
            current_altitude_m,
            seeing_now: Vec::new(),
            will_see: Vec::new(),
            filtered_reason: Some(FilterReason::CruiseAltitude),
            notes: vec![format!(
                "aircraft stays above the {:.0} m cruise cutoff for the next {:.0}s (currently \
                 {:.0} m) — no roadside/urban camera can resolve it at that altitude; not evaluated",
                visibility::CRUISE_ALTITUDE_CUTOFF_M,
                HORIZON_SECS,
                current_altitude_m
            )],
        }));
    }

    let cameras: Vec<Camera> = match cache::cameras::get_cameras(&redis_pool).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "cameras not yet available".to_string(),
            ));
        }
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    };

    let index = CameraIndex::build(&cameras);
    let (weather, weather_note) = nearest_weather(&redis_pool, now_lat, now_lon).await;
    let mut notes: Vec<String> = weather_note.into_iter().collect();

    let radius_km = visibility::max_possible_range_km();
    let mut seeing_now = Vec::new();
    let mut open_runs: HashMap<usize, RunState> = HashMap::new();
    let mut will_see = Vec::new();
    let mut points_skipped = 0usize;

    for (idx, point) in trajectory.points.iter().enumerate() {
        if point.alt_m > visibility::CRUISE_ALTITUDE_CUTOFF_M {
            points_skipped += 1;
            // Aircraft climbed back above the cutoff — close any open
            // windows, this point can't extend them.
            for (cam_idx, run) in open_runs.drain() {
                will_see.push(run.into_sighting(&cameras[cam_idx], STEP_SECS));
            }
            continue;
        }

        let seen_here: HashMap<usize, CameraAssessment> = index
            .candidates_within_km(point.lat, point.lon, radius_km)
            .into_iter()
            .filter_map(|cam_idx| {
                visibility::assess_camera(&cameras[cam_idx], point.lat, point.lon, point.alt_m, &weather)
                    .map(|assessment| (cam_idx, assessment))
            })
            .collect();

        if idx == 0 {
            for (cam_idx, assessment) in &seen_here {
                seeing_now.push(to_camera_sighting(&cameras[*cam_idx], assessment));
            }
            continue;
        }

        let still_open: HashSet<usize> = seen_here.keys().copied().collect();
        for (cam_idx, assessment) in seen_here {
            match open_runs.get_mut(&cam_idx) {
                Some(run) => run.extend(idx, assessment),
                None => {
                    open_runs.insert(cam_idx, RunState::new(idx, assessment));
                }
            }
        }
        let to_close: Vec<usize> = open_runs
            .keys()
            .filter(|cam_idx| !still_open.contains(*cam_idx))
            .copied()
            .collect();
        for cam_idx in to_close {
            if let Some(run) = open_runs.remove(&cam_idx) {
                will_see.push(run.into_sighting(&cameras[cam_idx], STEP_SECS));
            }
        }
    }

    for (cam_idx, run) in open_runs {
        will_see.push(run.into_sighting(&cameras[cam_idx], STEP_SECS));
    }

    seeing_now.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    will_see.sort_by(|a, b| {
        a.t_minus_secs
            .partial_cmp(&b.t_minus_secs)
            .unwrap_or(Ordering::Equal)
    });

    if points_skipped > 0 {
        notes.push(format!(
            "{points_skipped} of {} predicted points over the next {:.0}s are above the {:.0} m \
             cruise cutoff and were not evaluated",
            trajectory.points.len(),
            HORIZON_SECS,
            visibility::CRUISE_ALTITUDE_CUTOFF_M
        ));
    }

    let proximity_count = seeing_now
        .iter()
        .filter(|s| s.level == OpticalLevel::Proximity)
        .count()
        + will_see
            .iter()
            .filter(|s| s.level == OpticalLevel::Proximity)
            .count();
    if proximity_count > 0 {
        notes.push(format!(
            "{proximity_count} sighting(s) come from cameras with no reliable heading — \
             proximity only, no FOV cone test"
        ));
    }

    Ok(Json(AircraftCamerasResponse {
        icao,
        model: trajectory.model,
        current_altitude_m,
        seeing_now,
        will_see,
        filtered_reason: None,
        notes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use prediction::service::{AircraftMeasurement, PredictionService};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn measurement(icao: &str, lat: f64, lon: f64, alt_m: f64, is_military: bool) -> AircraftMeasurement {
        AircraftMeasurement {
            icao: icao.to_string(),
            lat,
            lon,
            alt_m,
            speed_ms: 80.0,
            heading_deg: 0.0,
            vertical_rate_ms: 0.0,
            is_military,
            on_ground: false,
        }
    }

    async fn predictor_with(measurements: &[AircraftMeasurement]) -> SharedPredictor {
        let mut svc = PredictionService::new();
        svc.process_batch(measurements);
        Arc::new(RwLock::new(svc))
    }

    #[tokio::test]
    async fn returns_404_for_unknown_icao() {
        let predictor = predictor_with(&[]).await;
        let pool = cache::pool::create_pool("redis://127.0.0.1:63799/0")
            .expect("pool construction doesn't connect eagerly");

        let result = get_aircraft_cameras(Path("ghost".to_string()), State(predictor), State(pool)).await;

        assert_eq!(result.unwrap_err().0, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn cruising_aircraft_is_filtered_without_touching_the_camera_cache() {
        // Well above CRUISE_ALTITUDE_CUTOFF_M, flying level (no vertical
        // rate) — never dips below the cutoff within the horizon.
        let predictor = predictor_with(&[measurement("civ1", 48.0, 2.0, 9000.0, false)]).await;
        // A pool pointed at a port nothing listens on: if the handler tried
        // to hit Redis for this case, it would hang/error instead of
        // returning the filtered response — this is the "filtered upstream,
        // never even loads cameras" contract under test.
        let pool = cache::pool::create_pool("redis://127.0.0.1:63799/0")
            .expect("pool construction doesn't connect eagerly");

        let result = get_aircraft_cameras(Path("civ1".to_string()), State(predictor), State(pool))
            .await
            .expect("cruising aircraft is a 200 with an explicit filter, not an error");

        assert!(matches!(result.filtered_reason, Some(FilterReason::CruiseAltitude)));
        assert!(result.seeing_now.is_empty());
        assert!(result.will_see.is_empty());
        assert!(result.notes.iter().any(|n| n.contains("cruise cutoff")));
    }
}
