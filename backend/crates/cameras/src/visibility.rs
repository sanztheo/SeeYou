//! Camera↔aircraft geometry (SeeYou v2 P2, Lot 6).
//!
//! Four-stage chain, each stage documented where it can honestly fail:
//! 1. **Geodesy** — bearing, horizontal/slant distance, elevation (with a
//!    horizon-dip curvature correction).
//! 2. **FOV cone** — horizontal membership from `view_heading_deg`/
//!    `view_fov_deg` (already on `Camera`, just not read until this lot);
//!    vertical membership from a heuristic vfov + assumed tilt (documented
//!    below, surfaced in every `explain`).
//! 3. **Pixel criterion** — Johnson detection/recognition thresholds from
//!    angular size, sensor resolution and camera hfov.
//! 4. **Range bound** — the plan describes this as
//!    `min(optical horizon, METAR visibility, pixel limit)`. This module
//!    applies the optical horizon and the pixel limit as hard sequential
//!    gates (in `assess_camera`) and folds METAR/ceiling in separately as a
//!    *soft* confidence multiplier, not a third hard term — per the explicit
//!    instruction that surface-station visibility/ceiling readings heuristically
//!    weight confidence rather than binary-cut a sighting (oblique visibility
//!    to an elevated target differs from horizontal surface visibility).
//!
//! Two unmodeled camera properties are assumed as fixed, documented
//! constants rather than per-camera fields (mast height, tilt): neither is
//! in this lot's scope (only `resolution_px` is added to `Camera`). Every
//! sighting this module produces carries these assumptions in `explain`.

use rstar::{PointDistance, RTreeObject, AABB};
use serde::{Deserialize, Serialize};

use crate::types::{Camera, CameraViewSource};
use crate::view::default_fov_for_source;

// ---- Constants (named, documented — every one is a heuristic surfaced in `explain`) ----

/// Camera mast height is not modeled on `Camera` (no field this lot) — this
/// is a conservative placeholder for `h_c` in the geodesy formulas below.
/// Typical traffic-cam mounts run 6-15 m; 10 m is the mid-point.
pub const ASSUMED_CAMERA_HEIGHT_M: f64 = 10.0;

/// Vertical FOV heuristic for 4:3 traffic cameras (corrected from an earlier
/// 9/16 guess that under-counted vertical membership by 25-33%).
pub const VFOV_RATIO: f64 = 0.75;

/// Camera tilt is not modeled either; true tilt is assumed to sit in the
/// 0-10° range, point-estimated at the midpoint for a single deterministic
/// cone test.
pub const ASSUMED_TILT_DEG: f64 = 5.0;

/// Johnson detection criterion: a point-sized, movement-identifiable target.
pub const DETECTION_PX: f64 = 2.0;
/// Johnson recognition criterion: shape-identifiable as an aircraft.
pub const RECOGNITION_PX: f64 = 8.0;

/// Conservative default wingspan when the aircraft type is unknown —
/// narrowbody, not the widebody exception. tar1090-db per-type lookup is
/// Lot 7a, not wired here.
pub const DEFAULT_WINGSPAN_M: f64 = 36.0;

/// Conservative default sensor horizontal resolution for a camera that
/// doesn't declare `resolution_px`.
pub const DEFAULT_RESOLUTION_PX: u32 = 640;

/// Admission cutoff: no roadside/urban camera at ~10 m sees a cruising
/// aircraft. Matches the P1 anti-noise threshold for `monitored_by`.
pub const CRUISE_ALTITUDE_CUTOFF_M: f64 = 3000.0;

/// Mean Earth radius (m) — haversine distance and initial bearing.
const EARTH_RADIUS_M: f64 = 6_371_000.0;

/// Effective Earth radius (m) for the horizon-dip curvature correction,
/// chosen so `optical_horizon_km(h) = 3.86 * sqrt(h_m)` — the constant the
/// plan specifies — falls out of `sqrt(2 * R_eff * h)`. Keeps the elevation
/// correction and the horizon-distance formula internally consistent
/// instead of mixing two different refraction models.
const EFFECTIVE_EARTH_RADIUS_M: f64 = 7_449_800.0;

/// Feet → metres, for METAR `ceiling_ft`.
const FEET_TO_METERS: f64 = 0.3048;

/// Heavy (not binary) confidence penalty when the aircraft sits above a
/// reported METAR ceiling — "quasi-bloquant" per the spec, not a hard cut.
const CEILING_EXCEEDED_PENALTY: f64 = 0.2;

/// Conservative degrees-per-km used only to size the R-tree's coarse
/// pre-filter query; the exact haversine distance is always re-checked
/// afterward, so over-inclusion here is harmless and under-inclusion would
/// silently drop real candidates.
const KM_PER_DEGREE: f64 = 111.0;
/// Safety margin on the coarse pre-filter radius (longitude degrees shrink
/// faster than this near the poles, never the other way round).
const PREFILTER_MARGIN: f64 = 1.5;

// ---- Optical classification ----

/// What a camera can resolve of an aircraft at its computed geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpticalLevel {
    /// Shape identifiable as an aircraft (≥ `RECOGNITION_PX`).
    Recognition,
    /// A movement-identifiable point (≥ `DETECTION_PX`).
    Detection,
    /// Camera has no reliable heading — the FOV cone can't be evaluated, so
    /// this is a distance-only "might catch it" signal, not an optical claim.
    Proximity,
}

/// Classify a pixel count against the Johnson thresholds. `None` means
/// below detection — not worth reporting even as a sighting.
pub fn classify_level(px: f64) -> Option<OpticalLevel> {
    if px >= RECOGNITION_PX {
        Some(OpticalLevel::Recognition)
    } else if px >= DETECTION_PX {
        Some(OpticalLevel::Detection)
    } else {
        None
    }
}

// ---- Stage 1: geodesy ----

/// Great-circle distance in metres (haversine).
pub fn haversine_distance_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let d_phi = (lat2 - lat1).to_radians();
    let d_lambda = (lon2 - lon1).to_radians();

    let a = (d_phi / 2.0).sin().powi(2) + phi1.cos() * phi2.cos() * (d_lambda / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    EARTH_RADIUS_M * c
}

/// Initial bearing from point 1 to point 2, in degrees, 0-360 (0 = north).
pub fn bearing_deg(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let d_lambda = (lon2 - lon1).to_radians();

    let y = d_lambda.sin() * phi2.cos();
    let x = phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * d_lambda.cos();
    let deg = y.atan2(x).to_degrees();
    (deg + 360.0) % 360.0
}

/// How much of the target's apparent height the Earth's curvature "eats"
/// over horizontal distance `d_h_m`, using the same effective radius as
/// `optical_horizon_km`.
fn curvature_drop_m(d_h_m: f64) -> f64 {
    d_h_m * d_h_m / (2.0 * EFFECTIVE_EARTH_RADIUS_M)
}

/// Elevation angle in degrees from the camera to the target, corrected for
/// horizon dip (Earth curvature + standard refraction, see
/// `EFFECTIVE_EARTH_RADIUS_M`). `delta_alt_m` is target altitude minus
/// camera height.
pub fn elevation_deg(d_h_m: f64, delta_alt_m: f64) -> f64 {
    if d_h_m <= 0.0 {
        return if delta_alt_m >= 0.0 { 90.0 } else { -90.0 };
    }
    (delta_alt_m - curvature_drop_m(d_h_m)).atan2(d_h_m).to_degrees()
}

/// Straight-line (oblique) distance from horizontal distance + altitude delta.
pub fn slant_distance_m(d_h_m: f64, delta_alt_m: f64) -> f64 {
    d_h_m.hypot(delta_alt_m)
}

/// Optical horizon distance (km) from a height in metres, with standard
/// refraction — the plan's own constant, `3.86 * sqrt(h_m)`.
pub fn optical_horizon_km(height_m: f64) -> f64 {
    3.86 * height_m.max(0.0).sqrt()
}

/// Everything geodesy gives us about one camera→aircraft pair.
#[derive(Debug, Clone, Serialize)]
pub struct SightingGeometry {
    pub bearing_deg: f64,
    pub elevation_deg: f64,
    pub horizontal_distance_m: f64,
    pub slant_distance_m: f64,
}

// ---- Stage 2: FOV cone membership ----

/// Absolute angular difference between two headings, wrapped to [0, 180].
fn angle_diff_deg(a: f64, b: f64) -> f64 {
    let mut d = (a - b) % 360.0;
    if d > 180.0 {
        d -= 360.0;
    }
    if d < -180.0 {
        d += 360.0;
    }
    d.abs()
}

/// Horizontal FOV membership: `|bearing - view_heading| <= fov/2`.
pub fn in_horizontal_cone(bearing_deg: f64, view_heading_deg: f64, view_fov_deg: f64) -> bool {
    angle_diff_deg(bearing_deg, view_heading_deg) <= view_fov_deg / 2.0
}

/// Vertical FOV membership against the `VFOV_RATIO`/`ASSUMED_TILT_DEG`
/// heuristic band.
pub fn in_vertical_cone(elevation_deg: f64, hfov_deg: f64) -> bool {
    let vfov = hfov_deg * VFOV_RATIO;
    (elevation_deg - ASSUMED_TILT_DEG).abs() <= vfov / 2.0
}

// ---- Stage 3: pixel criterion ----

/// Angular size of a `wingspan_m`-wide target at `slant_distance_m`, in
/// degrees (small-angle approximation — valid at these ranges).
pub fn angular_size_deg(wingspan_m: f64, slant_distance_m: f64) -> f64 {
    if slant_distance_m <= 0.0 {
        return 180.0;
    }
    (wingspan_m / slant_distance_m).to_degrees()
}

/// Angular size in sensor pixels, given the camera's horizontal FOV and
/// resolution.
pub fn angular_size_px(angular_size_deg: f64, hfov_deg: f64, resolution_px: u32) -> f64 {
    if hfov_deg <= 0.0 {
        return 0.0;
    }
    angular_size_deg * (resolution_px as f64 / hfov_deg)
}

// ---- Weather: soft confidence, not a hard cut ----

/// METAR readings nearest the sighting. Both fields heuristically weight
/// confidence — surface horizontal visibility and station ceiling are not
/// the same thing as oblique visibility to an elevated target.
#[derive(Debug, Clone, Copy, Default)]
pub struct WeatherContext {
    pub visibility_m: Option<f64>,
    pub ceiling_ft: Option<f64>,
}

/// Confidence multiplier (0-1) plus the notes explaining any penalty.
pub fn weather_confidence(
    weather: &WeatherContext,
    horizontal_distance_m: f64,
    aircraft_alt_m: f64,
) -> (f64, Vec<&'static str>) {
    let mut confidence = 1.0_f64;
    let mut notes = Vec::new();

    if let Some(visibility_m) = weather.visibility_m {
        if visibility_m > 0.0 && visibility_m < horizontal_distance_m {
            confidence *= (visibility_m / horizontal_distance_m).clamp(0.0, 1.0);
            notes.push(
                "METAR horizontal surface visibility is below this sighting's distance — \
                 heuristic penalty, not a hard cutoff (surface visibility differs from oblique \
                 visibility to an elevated target)",
            );
        }
    }

    if let Some(ceiling_ft) = weather.ceiling_ft {
        let ceiling_m = ceiling_ft * FEET_TO_METERS;
        if aircraft_alt_m > ceiling_m {
            confidence *= CEILING_EXCEEDED_PENALTY;
            notes.push(
                "aircraft altitude is above the reported METAR ceiling — heavy heuristic \
                 penalty (likely above the cloud layer)",
            );
        }
    }

    (confidence, notes)
}

// ---- Full per-camera assessment ----

/// Everything `assess_camera` produced for one camera→aircraft pair.
#[derive(Debug, Clone)]
pub struct CameraAssessment {
    pub level: OpticalLevel,
    /// 0-1, blends optical level with weather confidence — used for sorting.
    pub score: f64,
    pub px: f64,
    pub geometry: SightingGeometry,
    pub explain: Vec<String>,
}

fn base_score_for_level(level: OpticalLevel) -> f64 {
    match level {
        OpticalLevel::Recognition => 1.0,
        OpticalLevel::Detection => 0.6,
        OpticalLevel::Proximity => 0.3,
    }
}

/// Run the full four-stage chain for one camera against one aircraft
/// position. Returns `None` when the aircraft is out of the camera's reach
/// by any hard gate (horizon, FOV cone, or below-detection pixel count) —
/// callers should treat `None` as "not visible here", not an error.
pub fn assess_camera(
    camera: &Camera,
    aircraft_lat: f64,
    aircraft_lon: f64,
    aircraft_alt_m: f64,
    weather: &WeatherContext,
) -> Option<CameraAssessment> {
    let d_h = haversine_distance_m(camera.lat, camera.lon, aircraft_lat, aircraft_lon);
    let delta_alt = aircraft_alt_m - ASSUMED_CAMERA_HEIGHT_M;
    let geometry = SightingGeometry {
        bearing_deg: bearing_deg(camera.lat, camera.lon, aircraft_lat, aircraft_lon),
        elevation_deg: elevation_deg(d_h, delta_alt),
        horizontal_distance_m: d_h,
        slant_distance_m: slant_distance_m(d_h, delta_alt),
    };

    // Hard gate 1/2 of the range bound: beyond the optical horizon, nothing
    // else matters (Earth curvature blocks the line of sight outright).
    let horizon_m = optical_horizon_km(ASSUMED_CAMERA_HEIGHT_M) * 1000.0;
    if geometry.slant_distance_m > horizon_m {
        return None;
    }

    let hfov_deg = camera
        .view_fov_deg
        .unwrap_or_else(|| default_fov_for_source(&camera.source));
    let resolution_px = camera.resolution_px.unwrap_or(DEFAULT_RESOLUTION_PX);
    let px = angular_size_px(
        angular_size_deg(DEFAULT_WINGSPAN_M, geometry.slant_distance_m),
        hfov_deg,
        resolution_px,
    );

    let mut explain = vec![format!(
        "heuristics: camera height {:.0} m (mast height not modeled), vfov≈hfov×{:.2} (4:3), \
         tilt {:.0}° (true tilt unknown, assumed 0-10° range), wingspan {:.0} m (default, \
         tar1090-db per-type lookup not wired), resolution {} px",
        ASSUMED_CAMERA_HEIGHT_M, VFOV_RATIO, ASSUMED_TILT_DEG, DEFAULT_WINGSPAN_M, resolution_px
    )];

    let has_reliable_heading = matches!(
        camera.view_heading_source,
        Some(CameraViewSource::Provider) | Some(CameraViewSource::Parsed)
    );

    let level = if has_reliable_heading {
        let heading = camera.view_heading_deg?;
        // Hard gate: FOV cone membership (horizontal AND vertical).
        if !in_horizontal_cone(geometry.bearing_deg, heading, hfov_deg)
            || !in_vertical_cone(geometry.elevation_deg, hfov_deg)
        {
            return None;
        }
        // Hard gate 2/2 of the range bound: below-detection pixel count.
        let level = classify_level(px)?;
        explain.push(format!(
            "in FOV cone (heading {heading:.0}°, hfov {hfov_deg:.0}°); {px:.1}px \
             (detection≥{DETECTION_PX:.0}, recognition≥{RECOGNITION_PX:.0})"
        ));
        level
    } else {
        // No reliable heading: can't evaluate the cone at all. Still gate on
        // whether the target would even register at this camera's
        // resolution/FOV if it happened to be aimed there.
        if px < DETECTION_PX {
            return None;
        }
        explain.push(
            "no reliable heading (Estimated/absent view_heading_source) — proximity only, \
             FOV cone not evaluated"
                .to_string(),
        );
        OpticalLevel::Proximity
    };

    let (weather_conf, weather_notes) =
        weather_confidence(weather, geometry.horizontal_distance_m, aircraft_alt_m);
    explain.extend(weather_notes.into_iter().map(String::from));

    let score = (base_score_for_level(level) * weather_conf).clamp(0.0, 1.0);

    Some(CameraAssessment {
        level,
        score,
        px,
        geometry,
        explain,
    })
}

// ---- Spatial pre-filter (rstar) ----

/// The hard upper bound on any camera's usable range in this model: since
/// mast height is a fixed assumed constant (not per-camera), the optical
/// horizon term is identical for every camera and always `>=` the combined
/// range bound `assess_camera` actually applies. Safe to use as the R-tree
/// query radius — it can only over-include, never drop a real candidate.
pub fn max_possible_range_km() -> f64 {
    optical_horizon_km(ASSUMED_CAMERA_HEIGHT_M)
}

struct IndexedCameraPoint {
    index: usize,
    lat: f64,
    lon: f64,
}

impl RTreeObject for IndexedCameraPoint {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_point([self.lat, self.lon])
    }
}

impl PointDistance for IndexedCameraPoint {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        let d_lat = self.lat - point[0];
        let d_lon = self.lon - point[1];
        d_lat * d_lat + d_lon * d_lon
    }
}

/// Coarse spatial pre-filter over a camera slice, so a per-aircraft query
/// doesn't haversine-test all 11k+ cameras. Built fresh per request: camera
/// data changes slowly (~900 s cadence) and `bulk_load` over ~11k points is
/// sub-millisecond — a shared/cached tree would be premature complexity for
/// an on-demand endpoint.
pub struct CameraIndex {
    tree: rstar::RTree<IndexedCameraPoint>,
}

impl CameraIndex {
    pub fn build(cameras: &[Camera]) -> Self {
        let points: Vec<IndexedCameraPoint> = cameras
            .iter()
            .enumerate()
            .map(|(index, c)| IndexedCameraPoint {
                index,
                lat: c.lat,
                lon: c.lon,
            })
            .collect();
        Self {
            tree: rstar::RTree::bulk_load(points),
        }
    }

    /// Indices (into the slice passed to `build`) of cameras within
    /// `radius_km` of `(lat, lon)`, coarse degree-space query padded by
    /// `PREFILTER_MARGIN` — always re-checked with exact haversine downstream.
    pub fn candidates_within_km(&self, lat: f64, lon: f64, radius_km: f64) -> Vec<usize> {
        if radius_km <= 0.0 {
            return Vec::new();
        }
        let radius_deg = (radius_km / KM_PER_DEGREE) * PREFILTER_MARGIN;
        self.tree
            .locate_within_distance([lat, lon], radius_deg * radius_deg)
            .map(|p| p.index)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::StreamType;

    fn camera(
        lat: f64,
        lon: f64,
        heading: Option<f64>,
        fov: f64,
        source: Option<CameraViewSource>,
    ) -> Camera {
        Camera {
            id: "test-cam".to_string(),
            name: "Test Camera".to_string(),
            lat,
            lon,
            city: "Testville".to_string(),
            country: "US".to_string(),
            source: "caltrans".to_string(),
            stream_url: "http://example.com/stream".to_string(),
            stream_type: StreamType::Mjpeg,
            is_online: true,
            view_heading_deg: heading,
            view_fov_deg: Some(fov),
            view_heading_source: source,
            view_hint: None,
            resolution_px: None,
        }
    }

    // ---- Stage 1: geodesy ----

    #[test]
    fn haversine_one_degree_latitude_is_about_111km() {
        let d = haversine_distance_m(0.0, 0.0, 1.0, 0.0);
        assert!((d - 111_195.0).abs() < 100.0, "got {d}");
    }

    #[test]
    fn bearing_matches_known_cardinal_directions() {
        // Small offsets on the equator so cardinal directions are exact.
        assert!((bearing_deg(0.0, 0.0, 1.0, 0.0) - 0.0).abs() < 0.01); // north
        assert!((bearing_deg(0.0, 0.0, 0.0, 1.0) - 90.0).abs() < 0.01); // east
        assert!((bearing_deg(0.0, 0.0, -1.0, 0.0) - 180.0).abs() < 0.01); // south
        assert!((bearing_deg(0.0, 0.0, 0.0, -1.0) - 270.0).abs() < 0.01); // west
    }

    #[test]
    fn elevation_is_45_degrees_when_horizontal_and_vertical_offsets_match() {
        // At 100 m horizontal / 100 m vertical, curvature drop is negligible
        // (~0.0007 m), so elevation should be ~45°.
        let elev = elevation_deg(100.0, 100.0);
        assert!((elev - 45.0).abs() < 0.01, "got {elev}");
    }

    #[test]
    fn elevation_is_90_degrees_directly_overhead() {
        assert_eq!(elevation_deg(0.0, 500.0), 90.0);
    }

    #[test]
    fn elevation_curvature_correction_reduces_angle_at_long_range() {
        // Same delta_alt, longer distance: curvature should shave a
        // measurable amount off the naive atan2 (no-curvature) elevation.
        let d_h: f64 = 10_000.0;
        let delta_alt: f64 = 500.0;
        let naive = delta_alt.atan2(d_h).to_degrees();
        let corrected = elevation_deg(d_h, delta_alt);
        assert!(corrected < naive);
    }

    #[test]
    fn optical_horizon_matches_plan_constant() {
        // 3.86 * sqrt(10) ≈ 12.2 km.
        let d = optical_horizon_km(10.0);
        assert!((d - 12.2).abs() < 0.1, "got {d}");
    }

    // ---- Stage 2: FOV cone ----

    #[test]
    fn horizontal_cone_accepts_within_half_fov() {
        assert!(in_horizontal_cone(90.0, 100.0, 20.0)); // diff 10 == half-fov 10
        assert!(!in_horizontal_cone(90.0, 120.0, 20.0)); // diff 30 > half-fov 10
    }

    #[test]
    fn horizontal_cone_wraps_across_0_360() {
        // bearing 350°, heading 10°: true angular diff is 20°, not 340°.
        assert!(in_horizontal_cone(350.0, 10.0, 50.0)); // half-fov 25 >= 20
        assert!(!in_horizontal_cone(350.0, 10.0, 30.0)); // half-fov 15 < 20
    }

    #[test]
    fn vertical_cone_centers_on_assumed_tilt() {
        // hfov 40 -> vfov 30 -> half-vfov 15, centered at ASSUMED_TILT_DEG (5°).
        assert!(in_vertical_cone(5.0, 40.0)); // exactly at assumed tilt
        assert!(in_vertical_cone(20.0, 40.0)); // 15 away, at the edge
        assert!(!in_vertical_cone(25.0, 40.0)); // 20 away, outside
    }

    // ---- Stage 3: pixel criterion (reference numbers from the plan) ----

    #[test]
    fn pixel_criterion_matches_plan_reference_numbers() {
        // 640px / 60deg hfov = 10.7 px/deg. A320 (36m) at 3/8/10 km.
        let px_at = |d_m: f64| angular_size_px(angular_size_deg(36.0, d_m), 60.0, 640);

        assert!((px_at(3000.0) - 7.3).abs() < 0.1, "got {}", px_at(3000.0));
        assert!((px_at(8000.0) - 2.8).abs() < 0.15, "got {}", px_at(8000.0));
        assert!((px_at(10_000.0) - 2.2).abs() < 0.1, "got {}", px_at(10_000.0));

        // Widebody (60 m) at 5 km has the same ratio as the A320 at 3 km
        // (60/5 == 36/3), so the same px count.
        let px_widebody_5km = angular_size_px(angular_size_deg(60.0, 5000.0), 60.0, 640);
        assert!((px_widebody_5km - 7.3).abs() < 0.1, "got {px_widebody_5km}");
    }

    #[test]
    fn classify_level_thresholds() {
        assert_eq!(classify_level(1.9), None);
        assert_eq!(classify_level(2.0), Some(OpticalLevel::Detection));
        assert_eq!(classify_level(7.9), Some(OpticalLevel::Detection));
        assert_eq!(classify_level(8.0), Some(OpticalLevel::Recognition));
    }

    #[test]
    fn detection_range_is_about_11km_at_reference_constants() {
        // Below ~11km -> still >= 2px (detection); beyond -> below threshold.
        let px_11km = angular_size_px(angular_size_deg(36.0, 11_000.0), 60.0, 640);
        let px_12km = angular_size_px(angular_size_deg(36.0, 12_000.0), 60.0, 640);
        assert!(px_11km >= DETECTION_PX, "got {px_11km}");
        assert!(px_12km < DETECTION_PX, "got {px_12km}");
    }

    // ---- Weather confidence (soft, not binary) ----

    #[test]
    fn weather_confidence_defaults_to_1_when_no_data() {
        let (conf, notes) = weather_confidence(&WeatherContext::default(), 5000.0, 500.0);
        assert_eq!(conf, 1.0);
        assert!(notes.is_empty());
    }

    #[test]
    fn weather_confidence_unaffected_when_visibility_exceeds_distance() {
        let weather = WeatherContext {
            visibility_m: Some(10_000.0),
            ceiling_ft: None,
        };
        let (conf, _) = weather_confidence(&weather, 3000.0, 500.0);
        assert_eq!(conf, 1.0);
    }

    #[test]
    fn weather_confidence_penalizes_low_visibility() {
        let weather = WeatherContext {
            visibility_m: Some(2000.0),
            ceiling_ft: None,
        };
        let (conf, notes) = weather_confidence(&weather, 8000.0, 500.0);
        assert!((conf - 0.25).abs() < 1e-9, "got {conf}"); // 2000/8000
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn weather_confidence_heavily_penalizes_aircraft_above_ceiling() {
        let weather = WeatherContext {
            visibility_m: None,
            ceiling_ft: Some(2000.0), // ~609.6 m
        };
        let (conf, notes) = weather_confidence(&weather, 3000.0, 1000.0);
        assert!((conf - CEILING_EXCEEDED_PENALTY).abs() < 1e-9, "got {conf}");
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn weather_confidence_no_penalty_when_aircraft_below_ceiling() {
        let weather = WeatherContext {
            visibility_m: None,
            ceiling_ft: Some(5000.0), // ~1524 m
        };
        let (conf, notes) = weather_confidence(&weather, 3000.0, 1000.0);
        assert_eq!(conf, 1.0);
        assert!(notes.is_empty());
    }

    // ---- assess_camera: full chain ----

    #[test]
    fn assess_camera_recognizes_close_low_approach_with_reliable_heading() {
        // Camera at origin, heading due north, wide-ish fov. Aircraft 2km
        // north at 300m altitude — a plausible low approach.
        let cam = camera(0.0, 0.0, Some(0.0), 60.0, Some(CameraViewSource::Provider));
        let aircraft_lat = 2000.0 / 111_195.0; // ~2km north
        let result = assess_camera(&cam, aircraft_lat, 0.0, 300.0, &WeatherContext::default());

        let assessment = result.expect("expected a sighting");
        assert_eq!(assessment.level, OpticalLevel::Recognition);
        assert!(assessment.geometry.elevation_deg > 0.0);
    }

    #[test]
    fn assess_camera_rejects_target_outside_horizontal_cone() {
        // Camera facing north with a narrow fov; aircraft due east.
        let cam = camera(0.0, 0.0, Some(0.0), 30.0, Some(CameraViewSource::Provider));
        let aircraft_lon = 2000.0 / 111_195.0;
        let result = assess_camera(&cam, 0.0, aircraft_lon, 300.0, &WeatherContext::default());
        assert!(result.is_none());
    }

    #[test]
    fn assess_camera_rejects_beyond_optical_horizon() {
        let cam = camera(0.0, 0.0, Some(0.0), 60.0, Some(CameraViewSource::Provider));
        // ~30km north — well beyond the ~12.2km horizon at 10m mast height.
        let aircraft_lat = 30_000.0 / 111_195.0;
        let result = assess_camera(&cam, aircraft_lat, 0.0, 500.0, &WeatherContext::default());
        assert!(result.is_none());
    }

    #[test]
    fn assess_camera_falls_back_to_proximity_without_reliable_heading() {
        let cam = camera(0.0, 0.0, None, 60.0, None);
        let aircraft_lat = 2000.0 / 111_195.0;
        let result = assess_camera(&cam, aircraft_lat, 0.0, 300.0, &WeatherContext::default());

        let assessment = result.expect("expected a proximity sighting");
        assert_eq!(assessment.level, OpticalLevel::Proximity);
        assert!(assessment.explain.iter().any(|e| e.contains("no reliable heading")));
    }

    #[test]
    fn assess_camera_proximity_still_rejects_below_detection_pixel_count() {
        // No heading, but far enough that even the pixel count can't clear
        // detection (though still inside the optical horizon).
        let cam = camera(0.0, 0.0, None, 60.0, None);
        let aircraft_lat = 11_800.0 / 111_195.0; // inside horizon (~12.2km), outside detection (~11km)
        let result = assess_camera(&cam, aircraft_lat, 0.0, 500.0, &WeatherContext::default());
        assert!(result.is_none());
    }

    #[test]
    fn optical_level_serializes_to_snake_case() {
        assert_eq!(
            serde_json::to_string(&OpticalLevel::Recognition).unwrap(),
            "\"recognition\""
        );
        assert_eq!(
            serde_json::to_string(&OpticalLevel::Detection).unwrap(),
            "\"detection\""
        );
        assert_eq!(
            serde_json::to_string(&OpticalLevel::Proximity).unwrap(),
            "\"proximity\""
        );
    }

    // ---- Spatial index ----

    #[test]
    fn camera_index_finds_nearby_and_excludes_far_cameras() {
        let cams = vec![
            camera(0.0, 0.0, None, 60.0, None),                     // ~0km from query
            camera(0.01, 0.0, None, 60.0, None),                    // ~1.1km from query
            camera(5.0, 5.0, None, 60.0, None),                     // far away
        ];
        let index = CameraIndex::build(&cams);
        let hits = index.candidates_within_km(0.0, 0.0, 5.0);
        assert!(hits.contains(&0));
        assert!(hits.contains(&1));
        assert!(!hits.contains(&2));
    }

    #[test]
    fn max_possible_range_km_matches_optical_horizon_at_assumed_height() {
        assert_eq!(
            max_possible_range_km(),
            optical_horizon_km(ASSUMED_CAMERA_HEIGHT_M)
        );
    }
}
