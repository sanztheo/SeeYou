use nalgebra::{SMatrix, SVector};

pub const STATE_DIM: usize = 7;
pub const MEAS_DIM: usize = 6;

/// State: [x, y, vx, vy, z, vz, omega]  (ENU metres, m/s, rad/s)
pub type StateVec = SVector<f64, STATE_DIM>;
/// 7x7 state covariance / transition Jacobian / process noise
pub type StateMat = SMatrix<f64, STATE_DIM, STATE_DIM>;
/// Measurement: [x, y, vx, vy, z, vz]
pub type MeasVec = SVector<f64, MEAS_DIM>;
/// 6x6 measurement noise covariance
pub type MeasNoise = SMatrix<f64, MEAS_DIM, MEAS_DIM>;
/// 6x7 observation matrix
pub type ObsMat = SMatrix<f64, MEAS_DIM, STATE_DIM>;

/// Helper: build a 7-element state vector (nalgebra has no `new()` for dim > 6).
pub fn state_vec(x: f64, y: f64, vx: f64, vy: f64, z: f64, vz: f64, omega: f64) -> StateVec {
    StateVec::from_column_slice(&[x, y, vx, vy, z, vz, omega])
}

/// Helper: build a 6-element measurement vector.
pub fn meas_vec(x: f64, y: f64, vx: f64, vy: f64, z: f64, vz: f64) -> MeasVec {
    MeasVec::from_column_slice(&[x, y, vx, vy, z, vz])
}

/// Build the observation matrix H that maps state to measurement (drops omega).
pub fn observation_matrix() -> ObsMat {
    let mut h = ObsMat::zeros();
    for i in 0..MEAS_DIM {
        h[(i, i)] = 1.0;
    }
    h
}

/// Default measurement noise R.
/// ADS-B typical accuracies: ~100 m position, ~5 m/s velocity, ~50 m altitude.
pub fn default_measurement_noise() -> MeasNoise {
    MeasNoise::from_diagonal(&meas_vec(
        100.0_f64.powi(2), // x  (m^2)
        100.0_f64.powi(2), // y
        5.0_f64.powi(2),   // vx (m/s)^2
        5.0_f64.powi(2),   // vy
        50.0_f64.powi(2),  // z
        2.0_f64.powi(2),   // vz
    ))
}

/// Extended Kalman Filter with fixed state/measurement dimensions.
#[derive(Debug, Clone)]
pub struct Ekf {
    pub x: StateVec,
    pub p: StateMat,
}

impl Ekf {
    pub fn new(x: StateVec, p: StateMat) -> Self {
        Self { x, p }
    }

    /// Predict step.  Caller provides the propagated state, the Jacobian F,
    /// and the process noise Q (all model-specific).
    pub fn predict(&mut self, x_pred: StateVec, f_jac: &StateMat, q: &StateMat) {
        self.x = x_pred;
        self.p = f_jac * self.p * f_jac.transpose() + q;
    }

    /// Update step.  Returns the **log-likelihood** of the innovation
    /// (used by IMM for model probability updates).
    pub fn update(&mut self, z: &MeasVec, h: &ObsMat, r: &MeasNoise) -> f64 {
        let y = z - h * self.x;
        let s = h * self.p * h.transpose() + r;

        let s_inv = match s.try_inverse() {
            Some(inv) => inv,
            None => return f64::NEG_INFINITY,
        };

        let k = self.p * h.transpose() * s_inv;

        self.x += k * y;
        let i_kh = StateMat::identity() - k * h;
        // Joseph form for numerical stability
        self.p = i_kh * self.p * i_kh.transpose() + k * r * k.transpose();

        let det = s.determinant();
        if det <= 0.0 {
            return f64::NEG_INFINITY;
        }
        let n = MEAS_DIM as f64;
        let mahal = (y.transpose() * s_inv * y)[(0, 0)];
        -0.5 * (n * (2.0 * std::f64::consts::PI).ln() + det.ln() + mahal)
    }
}
