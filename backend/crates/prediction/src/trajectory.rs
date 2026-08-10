use serde::{Deserialize, Serialize};

use crate::ekf::{StateMat, StateVec};
use crate::imm::ImmEngine;
use crate::patterns::MilitaryPattern;

/// One point on the predicted trajectory polyline.
/// `lat`/`lon` are rounded to 5 decimals (~1.1 m) and `alt_m` to the metre —
/// wire payload reduction (SeeYou v2 P0-2). There is no per-point timestamp
/// or uncertainty: both are derivable from the trajectory-level `step_secs`
/// and `sigma_growth_m_s` (point `i`, 0-based, is `(i + 1) * step_secs`
/// seconds from now).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictedPoint {
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
}

/// Complete predicted trajectory for one aircraft.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictedTrajectory {
    pub icao: String,
    pub points: Vec<PredictedPoint>,
    /// Seconds between consecutive points.
    pub step_secs: f64,
    /// Combined horizontal+vertical 1-sigma uncertainty growth rate (m/s),
    /// replacing the old per-point `sigma_xy_m`/`sigma_z_m` pair: sigma at
    /// point `i` (0-based) ≈ `sigma_growth_m_s * (i + 1) * step_secs`.
    /// `0.0` for a cold-start trajectory, which tracks no covariance.
    pub sigma_growth_m_s: f64,
    pub pattern: Option<MilitaryPattern>,
    /// Model probabilities: [CV, CA, CT, CD]. All zero for a cold-start
    /// trajectory (no IMM state exists).
    pub model_probabilities: [f64; 4],
    /// "imm" for a tracked military aircraft (IMM-EKF state), "cv_coldstart"
    /// for a straight-line + vertical-rate projection from last known
    /// kinematics with no filter state — see `PredictionService::get_trajectory`.
    pub model: String,
}

/// Generate a predicted trajectory by propagating the IMM forward.
///
/// `origin_lat` / `origin_lon` is the ENU frame origin used to convert
/// the filter's (x, y) back to geodetic coordinates. Returns the points
/// plus a single uncertainty growth-rate estimate (1-sigma metres per
/// second), derived from the combined horizontal+vertical covariance at
/// the final point.
pub fn generate(
    imm: &ImmEngine,
    origin_lat: f64,
    origin_lon: f64,
    horizon_secs: f64,
    step_secs: f64,
) -> (Vec<PredictedPoint>, f64) {
    let mut points = Vec::new();
    let mut x = imm.state();
    let mut p = imm.covariance();

    let dominant = imm.dominant_model();

    let models = default_propagation_models();
    let model = &models[dominant];

    let steps = (horizon_secs / step_secs).ceil() as usize;
    let mut final_sigma_m = 0.0;

    for _ in 0..steps {
        let dt = step_secs;
        let x_new = model.predict(&x, dt);
        let f_jac = model.jacobian(&x, dt);
        let q = model.process_noise(dt);
        p = f_jac * p * f_jac.transpose() + q;
        x = x_new;

        let (lat, lon) = enu_to_latlon(x[0], x[1], origin_lat, origin_lon);

        let sigma_xy = (p[(0, 0)] + p[(1, 1)]).sqrt();
        let sigma_z = p[(4, 4)].sqrt();
        final_sigma_m = sigma_xy.hypot(sigma_z);

        points.push(PredictedPoint {
            lat: round5(lat),
            lon: round5(lon),
            alt_m: x[4].round(),
        });
    }

    let sigma_growth_m_s = if horizon_secs > 0.0 {
        final_sigma_m / horizon_secs
    } else {
        0.0
    };

    (points, sigma_growth_m_s)
}

/// Cold-start projection for an aircraft with no IMM/EKF state: a straight
/// line at the last known heading/speed, plus a constant vertical rate.
/// There is no covariance to track, so this only produces points — callers
/// report `sigma_growth_m_s: 0.0` alongside them.
pub fn generate_cv(
    lat: f64,
    lon: f64,
    alt_m: f64,
    speed_ms: f64,
    heading_deg: f64,
    vertical_rate_ms: f64,
    horizon_secs: f64,
    step_secs: f64,
) -> Vec<PredictedPoint> {
    let heading_rad = heading_deg.to_radians();
    let vx = speed_ms * heading_rad.sin();
    let vy = speed_ms * heading_rad.cos();

    let steps = (horizon_secs / step_secs).ceil() as usize;
    let mut points = Vec::with_capacity(steps);

    for i in 1..=steps {
        let dt = i as f64 * step_secs;
        let (new_lat, new_lon) = enu_to_latlon(vx * dt, vy * dt, lat, lon);
        points.push(PredictedPoint {
            lat: round5(new_lat),
            lon: round5(new_lon),
            alt_m: (alt_m + vertical_rate_ms * dt).round(),
        });
    }

    points
}

/// Propagate the state forward for a single step (used by service).
pub fn propagate_state(
    x: &StateVec,
    p: &StateMat,
    model: &dyn crate::models::MotionModel,
    dt: f64,
) -> (StateVec, StateMat) {
    let x_new = model.predict(x, dt);
    let f_jac = model.jacobian(x, dt);
    let q = model.process_noise(dt);
    let p_new = f_jac * *p * f_jac.transpose() + q;
    (x_new, p_new)
}

/// Round to 5 decimal places (~1.1 m at the equator) — wire payload reduction.
fn round5(value: f64) -> f64 {
    (value * 100_000.0).round() / 100_000.0
}

fn enu_to_latlon(x_m: f64, y_m: f64, origin_lat: f64, origin_lon: f64) -> (f64, f64) {
    let lat = origin_lat + y_m / 111_320.0;
    let cos_lat = origin_lat.to_radians().cos();
    let lon = if cos_lat > 1e-6 {
        origin_lon + x_m / (111_320.0 * cos_lat)
    } else {
        origin_lon
    };
    (lat, lon)
}

/// Build the four default models for trajectory propagation.
fn default_propagation_models() -> Vec<Box<dyn crate::models::MotionModel>> {
    vec![
        Box::new(crate::models::ConstantVelocity::default()),
        Box::new(crate::models::ConstantAcceleration::default()),
        Box::new(crate::models::CoordinatedTurn::default()),
        Box::new(crate::models::ClimbDescend::default()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ekf::meas_vec;
    use crate::models;

    fn initialised_imm() -> ImmEngine {
        let mut imm = ImmEngine::new(vec![
            Box::new(models::ConstantVelocity::default()),
            Box::new(models::ConstantAcceleration::default()),
            Box::new(models::CoordinatedTurn::default()),
            Box::new(models::ClimbDescend::default()),
        ]);
        // North-east cruise: vx=50 m/s, vy=50 m/s, climbing at 2 m/s.
        let z = meas_vec(0.0, 0.0, 50.0, 50.0, 8000.0, 2.0);
        imm.step(&z, 1.0);
        imm
    }

    #[test]
    fn generate_returns_horizon_over_step_points() {
        let imm = initialised_imm();
        let (points, _growth) = generate(&imm, 48.0, 2.0, 300.0, 15.0);
        assert_eq!(points.len(), 20); // 300s / 15s
    }

    #[test]
    fn generate_rounds_lat_lon_to_5_decimals_and_alt_to_metre() {
        let imm = initialised_imm();
        let (points, _growth) = generate(&imm, 48.0, 2.0, 300.0, 15.0);
        for p in &points {
            let lat_scaled = p.lat * 100_000.0;
            let lon_scaled = p.lon * 100_000.0;
            assert!((lat_scaled - lat_scaled.round()).abs() < 1e-6);
            assert!((lon_scaled - lon_scaled.round()).abs() < 1e-6);
            assert!((p.alt_m - p.alt_m.round()).abs() < 1e-9);
        }
    }

    #[test]
    fn generate_sigma_growth_rate_is_non_negative() {
        let imm = initialised_imm();
        let (_points, growth) = generate(&imm, 48.0, 2.0, 300.0, 15.0);
        assert!(growth >= 0.0);
    }

    #[test]
    fn generate_cv_projects_straight_line_and_climbs() {
        // Due north at 100 m/s, climbing at 5 m/s, for 100s at 100s step.
        let points = generate_cv(48.0, 2.0, 1000.0, 100.0, 0.0, 5.0, 100.0, 100.0);
        assert_eq!(points.len(), 1);
        let p = &points[0];
        // 100 m/s north for 100s = 10,000 m ≈ 0.0898 deg latitude.
        assert!((p.lat - 48.0898).abs() < 1e-3);
        assert!((p.lon - 2.0).abs() < 1e-9); // due north: no longitude drift
        assert_eq!(p.alt_m, 1500.0); // 1000 + 5*100
    }

    #[test]
    fn generate_cv_rounds_lat_lon_to_5_decimals() {
        let points = generate_cv(48.123456789, 2.987654321, 1000.0, 50.0, 45.0, 0.0, 60.0, 30.0);
        for p in &points {
            let lat_scaled = p.lat * 100_000.0;
            let lon_scaled = p.lon * 100_000.0;
            assert!((lat_scaled - lat_scaled.round()).abs() < 1e-6);
            assert!((lon_scaled - lon_scaled.round()).abs() < 1e-6);
        }
    }
}
