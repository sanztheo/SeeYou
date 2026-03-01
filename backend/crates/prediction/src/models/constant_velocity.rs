use crate::ekf::{state_vec, StateMat, StateVec};
use crate::models::{build_process_noise, MotionModel};

/// Constant Velocity: straight-line flight, omega forced to zero.
/// Low process noise — assumes benign, non-manoeuvring flight.
pub struct ConstantVelocity {
    pub sigma_a_xy: f64,
    pub sigma_a_z: f64,
}

impl Default for ConstantVelocity {
    fn default() -> Self {
        Self {
            sigma_a_xy: 0.5,
            sigma_a_z: 0.5,
        }
    }
}

impl MotionModel for ConstantVelocity {
    fn predict(&self, x: &StateVec, dt: f64) -> StateVec {
        state_vec(
            x[0] + x[2] * dt,
            x[1] + x[3] * dt,
            x[2],
            x[3],
            x[4] + x[5] * dt,
            x[5],
            0.0,
        )
    }

    fn jacobian(&self, _x: &StateVec, dt: f64) -> StateMat {
        let mut f = StateMat::identity();
        f[(0, 2)] = dt;
        f[(1, 3)] = dt;
        f[(4, 5)] = dt;
        // omega row: all zero (omega forced to 0)
        f[(6, 6)] = 0.0;
        f
    }

    fn process_noise(&self, dt: f64) -> StateMat {
        build_process_noise(dt, self.sigma_a_xy, self.sigma_a_z, 0.001)
    }
}
