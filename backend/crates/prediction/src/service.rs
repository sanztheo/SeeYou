use std::collections::HashMap;
use std::time::Instant;

use crate::ekf::meas_vec;
use crate::history::{HistoryBuffer, HistoryPoint};
use crate::imm::ImmEngine;
use crate::models;
use crate::patterns::{self, MilitaryPattern};
use crate::trajectory::{self, PredictedTrajectory};

/// How far ahead to predict (seconds).
const PREDICTION_HORIZON_SECS: f64 = 300.0;
/// Spacing between predicted points.
const PREDICTION_STEP_SECS: f64 = 5.0;
/// History buffer length.
const HISTORY_SECS: f64 = 1800.0;
/// Prune trackers not seen for this long.
const STALE_SECS: f64 = 120.0;

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

/// The top-level prediction service.  Feed it aircraft measurements and
/// it returns predicted trajectories for military aircraft.
pub struct PredictionService {
    trackers: HashMap<String, AircraftState>,
    epoch: Instant,
}

impl PredictionService {
    pub fn new() -> Self {
        Self {
            trackers: HashMap::new(),
            epoch: Instant::now(),
        }
    }

    fn now_secs(&self) -> f64 {
        self.epoch.elapsed().as_secs_f64()
    }

    /// Feed a batch of aircraft and get predictions for all tracked military aircraft.
    pub fn process_batch(&mut self, measurements: &[AircraftMeasurement]) -> Vec<PredictedTrajectory> {
        let now = Instant::now();
        let t = self.now_secs();

        for m in measurements {
            if !m.is_military {
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
        let (x_enu, y_enu) = latlon_to_enu(
            m.lat,
            m.lon,
            state.origin_lat,
            state.origin_lon,
        );

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
    }

    fn generate_predictions(&self) -> Vec<PredictedTrajectory> {
        let mut result = Vec::with_capacity(self.trackers.len());

        for (icao, state) in &self.trackers {
            if !state.imm.is_initialised() {
                continue;
            }

            let points = trajectory::generate(
                &state.imm,
                state.origin_lat,
                state.origin_lon,
                PREDICTION_HORIZON_SECS,
                PREDICTION_STEP_SECS,
            );

            result.push(PredictedTrajectory {
                icao: icao.clone(),
                points,
                pattern: state.pattern.clone(),
                model_probabilities: state.imm.probabilities(),
            });
        }

        result
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
