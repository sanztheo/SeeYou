mod climb_descend;
mod constant_acceleration;
mod constant_velocity;
mod coordinated_turn;

pub use climb_descend::ClimbDescend;
pub use constant_acceleration::ConstantAcceleration;
pub use constant_velocity::ConstantVelocity;
pub use coordinated_turn::CoordinatedTurn;

use crate::ekf::{StateMat, StateVec};

/// Every motion model provides a nonlinear state transition, its Jacobian,
/// and a process-noise covariance matrix Q.
pub trait MotionModel: Send + Sync {
    fn predict(&self, x: &StateVec, dt: f64) -> StateVec;
    fn jacobian(&self, x: &StateVec, dt: f64) -> StateMat;
    fn process_noise(&self, dt: f64) -> StateMat;
}

/// Piecewise-constant white-noise acceleration model for a single (pos, vel) pair.
/// Returns the 2x2 block: [[dt^3/3, dt^2/2], [dt^2/2, dt]] * sigma_a^2
fn pwa_block(dt: f64, sigma_a: f64) -> (f64, f64, f64) {
    let q = sigma_a * sigma_a;
    let dt2 = dt * dt;
    let dt3 = dt2 * dt;
    (q * dt3 / 3.0, q * dt2 / 2.0, q * dt)
}

/// Build a full 7x7 Q matrix from horizontal accel noise, vertical accel noise,
/// and turn-rate noise intensities.
pub fn build_process_noise(dt: f64, sigma_a_xy: f64, sigma_a_z: f64, sigma_omega: f64) -> StateMat {
    let mut q = StateMat::zeros();
    let (q00, q02, q22) = pwa_block(dt, sigma_a_xy);

    // x-vx block
    q[(0, 0)] = q00;
    q[(0, 2)] = q02;
    q[(2, 0)] = q02;
    q[(2, 2)] = q22;

    // y-vy block
    q[(1, 1)] = q00;
    q[(1, 3)] = q02;
    q[(3, 1)] = q02;
    q[(3, 3)] = q22;

    // z-vz block
    let (qz00, qz02, qz22) = pwa_block(dt, sigma_a_z);
    q[(4, 4)] = qz00;
    q[(4, 5)] = qz02;
    q[(5, 4)] = qz02;
    q[(5, 5)] = qz22;

    // omega
    q[(6, 6)] = sigma_omega * sigma_omega * dt;

    q
}
