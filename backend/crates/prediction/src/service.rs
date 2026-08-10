use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;

use crate::ekf::meas_vec;
use crate::history::{HistoryBuffer, HistoryPoint};
use crate::imm::ImmEngine;
use crate::models;
use crate::patterns::{self, MilitaryPattern};
use crate::trajectory::{self, PredictedTrajectory};

/// How far ahead to predict (seconds).
const PREDICTION_HORIZON_SECS: f64 = 300.0;
/// Spacing between predicted points.
const PREDICTION_STEP_SECS: f64 = 15.0;
/// History buffer length.
const HISTORY_SECS: f64 = 1800.0;
/// Prune trackers not seen for this long.
const STALE_SECS: f64 = 120.0;

/// Shared, lock-guarded prediction state — reachable from both the aircraft
/// tracker task (write lock, held for one `process_batch` call per poll) and
/// the on-demand `GET /aircraft/:icao/predict` handler (read lock).
pub type SharedPredictor = Arc<RwLock<PredictionService>>;

/// Input measurement from ADS-B.
pub struct AircraftMeasurement {
    pub icao: String,
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
    pub speed_ms: f64,
    pub heading_deg: f64,
    pub vertical_rate_ms: f64,
    pub is_military: bool,
    pub on_ground: bool,
}

/// Per-aircraft tracking state.
struct AircraftState {
    imm: ImmEngine,
    history: HistoryBuffer,
    origin_lat: f64,
    origin_lon: f64,
    last_t: f64,
    pattern: Option<MilitaryPattern>,
    last_seen: Instant,
}

/// Last known kinematics for an aircraft with no IMM/EKF state. Populated
/// from every batch for every aircraft (civil and military — see
/// `PredictionService::process_batch`), so `get_trajectory` always has
/// something to cold-start a `ConstantVelocity` projection from.
#[derive(Debug, Clone, Copy)]
struct LastKinematics {
    lat: f64,
    lon: f64,
    alt_m: f64,
    speed_ms: f64,
    heading_deg: f64,
    vertical_rate_ms: f64,
    last_seen: Instant,
}

/// The top-level prediction service.  Feed it aircraft measurements and
/// it returns predicted trajectories for military aircraft.
pub struct PredictionService {
    trackers: HashMap<String, AircraftState>,
    last_kinematics: HashMap<String, LastKinematics>,
    epoch: Instant,
}

impl PredictionService {
    pub fn new() -> Self {
        Self {
            trackers: HashMap::new(),
            last_kinematics: HashMap::new(),
            epoch: Instant::now(),
        }
    }

    fn now_secs(&self) -> f64 {
        self.epoch.elapsed().as_secs_f64()
    }

    /// Feed a batch of aircraft and get predictions for all tracked military
    /// aircraft. Every aircraft's last known kinematics is recorded
    /// regardless of `is_military` — that's what lets `get_trajectory` fall
    /// back to a cold-start projection for a civil aircraft, which never
    /// gets an IMM tracker.
    pub fn process_batch(
        &mut self,
        measurements: &[AircraftMeasurement],
    ) -> Vec<PredictedTrajectory> {
        let now = Instant::now();
        let t = self.now_secs();

        for m in measurements {
            self.last_kinematics.insert(
                m.icao.clone(),
                LastKinematics {
                    lat: m.lat,
                    lon: m.lon,
                    alt_m: m.alt_m,
                    speed_ms: m.speed_ms,
                    heading_deg: m.heading_deg,
                    vertical_rate_ms: m.vertical_rate_ms,
                    last_seen: now,
                },
            );

            if !m.is_military || m.on_ground {
                continue;
            }
            self.update_aircraft(m, t, now);
        }

        self.prune_stale(now);
        self.generate_predictions()
    }

    fn update_aircraft(&mut self, m: &AircraftMeasurement, t: f64, now: Instant) {
        let state = self.trackers.entry(m.icao.clone()).or_insert_with(|| {
            let imm = ImmEngine::new(vec![
                Box::new(models::ConstantVelocity::default()),
                Box::new(models::ConstantAcceleration::default()),
                Box::new(models::CoordinatedTurn::default()),
                Box::new(models::ClimbDescend::default()),
            ]);
            AircraftState {
                imm,
                history: HistoryBuffer::new(HISTORY_SECS),
                origin_lat: m.lat,
                origin_lon: m.lon,
                last_t: t,
                pattern: None,
                last_seen: now,
            }
        });

        state.last_seen = now;

        // Convert geodetic to ENU relative to the aircraft's ENU origin
        let (x_enu, y_enu) = latlon_to_enu(m.lat, m.lon, state.origin_lat, state.origin_lon);

        let heading_rad = m.heading_deg.to_radians();
        let vx = m.speed_ms * heading_rad.sin();
        let vy = m.speed_ms * heading_rad.cos();

        let z_meas = meas_vec(x_enu, y_enu, vx, vy, m.alt_m, m.vertical_rate_ms);

        let dt = (t - state.last_t).max(0.1);
        state.last_t = t;

        state.imm.step(&z_meas, dt);

        state.history.push(HistoryPoint {
            lat: m.lat,
            lon: m.lon,
            alt_m: m.alt_m,
            speed_ms: m.speed_ms,
            heading_deg: m.heading_deg,
            vrate_ms: m.vertical_rate_ms,
            t,
        });

        // Run pattern detection periodically (not every update)
        if state.history.len() % 5 == 0 {
            state.pattern = patterns::detect(&state.history);
        }
    }

    fn prune_stale(&mut self, now: Instant) {
        self.trackers
            .retain(|_, s| now.duration_since(s.last_seen).as_secs_f64() < STALE_SECS);
        self.last_kinematics
            .retain(|_, k| now.duration_since(k.last_seen).as_secs_f64() < STALE_SECS);
    }

    fn generate_predictions(&self) -> Vec<PredictedTrajectory> {
        let mut result = Vec::with_capacity(self.trackers.len());

        for (icao, state) in &self.trackers {
            if !state.imm.is_initialised() {
                continue;
            }

            let (points, sigma_growth_m_s) = trajectory::generate(
                &state.imm,
                state.origin_lat,
                state.origin_lon,
                PREDICTION_HORIZON_SECS,
                PREDICTION_STEP_SECS,
            );

            result.push(PredictedTrajectory {
                icao: icao.clone(),
                points,
                step_secs: PREDICTION_STEP_SECS,
                sigma_growth_m_s,
                pattern: state.pattern.clone(),
                model_probabilities: state.imm.probabilities(),
                model: "imm".to_string(),
            });
        }

        result
    }

    /// Full-resolution trajectory for one aircraft, on demand (the
    /// `GET /aircraft/:icao/predict` route). Replays the IMM state if one
    /// exists (military, airborne, already seen at least once); otherwise
    /// cold-starts a `ConstantVelocity` projection from the aircraft's last
    /// known kinematics — that fallback is what makes this work for civil
    /// aircraft, which never get an IMM tracker (see `process_batch`).
    pub fn get_trajectory(
        &self,
        icao: &str,
        horizon_secs: f64,
        step_secs: f64,
    ) -> Option<PredictedTrajectory> {
        if let Some(state) = self.trackers.get(icao) {
            if state.imm.is_initialised() {
                let (points, sigma_growth_m_s) = trajectory::generate(
                    &state.imm,
                    state.origin_lat,
                    state.origin_lon,
                    horizon_secs,
                    step_secs,
                );
                return Some(PredictedTrajectory {
                    icao: icao.to_string(),
                    points,
                    step_secs,
                    sigma_growth_m_s,
                    pattern: state.pattern.clone(),
                    model_probabilities: state.imm.probabilities(),
                    model: "imm".to_string(),
                });
            }
        }

        let kin = self.last_kinematics.get(icao)?;
        let points = trajectory::generate_cv(
            kin.lat,
            kin.lon,
            kin.alt_m,
            kin.speed_ms,
            kin.heading_deg,
            kin.vertical_rate_ms,
            horizon_secs,
            step_secs,
        );
        Some(PredictedTrajectory {
            icao: icao.to_string(),
            points,
            step_secs,
            sigma_growth_m_s: 0.0,
            pattern: None,
            model_probabilities: [0.0; 4],
            model: "cv_coldstart".to_string(),
        })
    }

    pub fn tracked_count(&self) -> usize {
        self.trackers.len()
    }
}

impl Default for PredictionService {
    fn default() -> Self {
        Self::new()
    }
}

fn latlon_to_enu(lat: f64, lon: f64, origin_lat: f64, origin_lon: f64) -> (f64, f64) {
    let cos_lat = origin_lat.to_radians().cos();
    let x = (lon - origin_lon) * 111_320.0 * cos_lat;
    let y = (lat - origin_lat) * 111_320.0;
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn measurement(icao: &str, is_military: bool, on_ground: bool) -> AircraftMeasurement {
        AircraftMeasurement {
            icao: icao.to_string(),
            lat: 48.0,
            lon: 2.0,
            alt_m: 8000.0,
            speed_ms: 200.0,
            heading_deg: 90.0,
            vertical_rate_ms: 0.0,
            is_military,
            on_ground,
        }
    }

    #[test]
    fn process_batch_ignores_civilian_aircraft_for_imm_but_still_predicts_on_demand() {
        let mut svc = PredictionService::new();
        svc.process_batch(&[measurement("civ1", false, false)]);

        // No IMM tracker for a civilian — tracked_count stays at 0.
        assert_eq!(svc.tracked_count(), 0);

        // But get_trajectory still returns a cold-start projection, because
        // last_kinematics is fed for every aircraft, not just military ones.
        let traj = svc.get_trajectory("civ1", 300.0, 15.0).unwrap();
        assert_eq!(traj.model, "cv_coldstart");
        assert!(!traj.points.is_empty());
    }

    #[test]
    fn process_batch_tracks_airborne_military_aircraft() {
        let mut svc = PredictionService::new();
        svc.process_batch(&[measurement("mil1", true, false)]);
        assert_eq!(svc.tracked_count(), 1);

        let traj = svc.get_trajectory("mil1", 300.0, 15.0).unwrap();
        assert_eq!(traj.model, "imm");
    }

    #[test]
    fn process_batch_skips_imm_for_grounded_military_aircraft() {
        let mut svc = PredictionService::new();
        svc.process_batch(&[measurement("mil-parked", true, true)]);

        // Not IMM-tracked (on the ground), but still cold-start-able.
        assert_eq!(svc.tracked_count(), 0);
        let traj = svc.get_trajectory("mil-parked", 300.0, 15.0).unwrap();
        assert_eq!(traj.model, "cv_coldstart");
    }

    #[test]
    fn get_trajectory_returns_none_for_unknown_icao() {
        let svc = PredictionService::new();
        assert!(svc.get_trajectory("ghost", 300.0, 15.0).is_none());
    }

    #[test]
    fn prune_stale_purges_last_kinematics_for_unseen_aircraft() {
        let mut svc = PredictionService::new();
        svc.process_batch(&[measurement("civ-gone", false, false)]);
        assert!(svc.get_trajectory("civ-gone", 300.0, 15.0).is_some());

        // Simulate STALE_SECS elapsing without another sighting: last_kinematics
        // must be purged alongside trackers, or it grows unbounded for every
        // ICAO ever seen (the leak this test guards against).
        let future = Instant::now() + std::time::Duration::from_secs_f64(STALE_SECS + 1.0);
        svc.prune_stale(future);

        assert!(svc.get_trajectory("civ-gone", 300.0, 15.0).is_none());
    }

    #[test]
    fn generate_predictions_uses_configured_horizon_and_step() {
        let mut svc = PredictionService::new();
        svc.process_batch(&[measurement("mil2", true, false)]);
        let predictions = svc.process_batch(&[measurement("mil2", true, false)]);
        assert_eq!(predictions.len(), 1);
        assert_eq!(predictions[0].step_secs, PREDICTION_STEP_SECS);
        assert_eq!(
            predictions[0].points.len(),
            (PREDICTION_HORIZON_SECS / PREDICTION_STEP_SECS).ceil() as usize
        );
    }
}
