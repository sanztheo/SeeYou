use serde::{Deserialize, Serialize};

use crate::ekf::{StateMat, StateVec};
use crate::imm::ImmEngine;
use crate::patterns::MilitaryPattern;

/// One point on the predicted trajectory polyline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictedPoint {
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
    /// Seconds from now.
    pub dt_secs: f64,
    /// 1-sigma horizontal uncertainty (metres).
    pub sigma_xy_m: f64,
    /// 1-sigma vertical uncertainty (metres).
    pub sigma_z_m: f64,
}

/// Complete predicted trajectory for one aircraft.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictedTrajectory {
    pub icao: String,
    pub points: Vec<PredictedPoint>,
    pub pattern: Option<MilitaryPattern>,
    /// Model probabilities: [CV, CA, CT, CD].
    pub model_probabilities: [f64; 4],
}

/// Generate a predicted trajectory by propagating the IMM forward.
///
/// `origin_lat` / `origin_lon` is the ENU frame origin used to convert
/// the filter's (x, y) back to geodetic coordinates.
pub fn generate(
    imm: &ImmEngine,
    origin_lat: f64,
    origin_lon: f64,
    horizon_secs: f64,
    step_secs: f64,
) -> Vec<PredictedPoint> {
    let mut points = Vec::new();
    let mut x = imm.state();
    let mut p = imm.covariance();

    let dominant = imm.dominant_model();

    let models = default_propagation_models();
    let model = &models[dominant];

    let steps = (horizon_secs / step_secs).ceil() as usize;

    for i in 1..=steps {
        let dt = step_secs;
        let x_new = model.predict(&x, dt);
        let f_jac = model.jacobian(&x, dt);
        let q = model.process_noise(dt);
        p = f_jac * p * f_jac.transpose() + q;
        x = x_new;

        let (lat, lon) = enu_to_latlon(x[0], x[1], origin_lat, origin_lon);

        let sigma_xy = (p[(0, 0)] + p[(1, 1)]).sqrt();
        let sigma_z = p[(4, 4)].sqrt();

        points.push(PredictedPoint {
            lat,
            lon,
            alt_m: x[4],
            dt_secs: i as f64 * step_secs,
            sigma_xy_m: sigma_xy,
            sigma_z_m: sigma_z,
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
