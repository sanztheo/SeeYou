use crate::ekf::{state_vec, StateMat, StateVec};
use crate::models::{build_process_noise, MotionModel};

const OMEGA_EPS: f64 = 1e-6;

/// Coordinated Turn: the aircraft follows a circular arc at constant
/// turn-rate omega.  This is the critical model for military aircraft
/// that frequently execute orbits, racetracks, and patrol turns.
pub struct CoordinatedTurn {
    pub sigma_a_xy: f64,
    pub sigma_a_z: f64,
    pub sigma_omega: f64,
}

impl Default for CoordinatedTurn {
    fn default() -> Self {
        Self {
            sigma_a_xy: 1.0,
            sigma_a_z: 0.5,
            sigma_omega: 0.03,
        }
    }
}

impl MotionModel for CoordinatedTurn {
    fn predict(&self, x: &StateVec, dt: f64) -> StateVec {
        let (vx, vy) = (x[2], x[3]);
        let omega = x[6];

        if omega.abs() < OMEGA_EPS {
            return state_vec(
                x[0] + vx * dt,
                x[1] + vy * dt,
                vx,
                vy,
                x[4] + x[5] * dt,
                x[5],
                omega,
            );
        }

        let wdt = omega * dt;
        let sin_wdt = wdt.sin();
        let cos_wdt = wdt.cos();

        state_vec(
            x[0] + (sin_wdt * vx - (1.0 - cos_wdt) * vy) / omega,
            x[1] + ((1.0 - cos_wdt) * vx + sin_wdt * vy) / omega,
            cos_wdt * vx - sin_wdt * vy,
            sin_wdt * vx + cos_wdt * vy,
            x[4] + x[5] * dt,
            x[5],
            omega,
        )
    }

    fn jacobian(&self, x: &StateVec, dt: f64) -> StateMat {
        let (vx, vy) = (x[2], x[3]);
        let omega = x[6];
        let mut f = StateMat::identity();

        f[(4, 5)] = dt;

        if omega.abs() < OMEGA_EPS {
            f[(0, 2)] = dt;
            f[(1, 3)] = dt;
            return f;
        }

        let wdt = omega * dt;
        let sin_wdt = wdt.sin();
        let cos_wdt = wdt.cos();
        let w = omega;
        let w2 = w * w;

        // dx/dvx, dx/dvy
        f[(0, 2)] = sin_wdt / w;
        f[(0, 3)] = -(1.0 - cos_wdt) / w;

        // dy/dvx, dy/dvy
        f[(1, 2)] = (1.0 - cos_wdt) / w;
        f[(1, 3)] = sin_wdt / w;

        // dvx/dvx, dvx/dvy
        f[(2, 2)] = cos_wdt;
        f[(2, 3)] = -sin_wdt;

        // dvy/dvx, dvy/dvy
        f[(3, 2)] = sin_wdt;
        f[(3, 3)] = cos_wdt;

        // Partials with respect to omega (the tricky part)
        // dx/domega
        f[(0, 6)] = (vx * (wdt * cos_wdt - sin_wdt) - vy * (wdt * sin_wdt - 1.0 + cos_wdt)) / w2;
        // dy/domega
        f[(1, 6)] = (vx * (wdt * sin_wdt - 1.0 + cos_wdt) + vy * (wdt * cos_wdt - sin_wdt)) / w2;
        // dvx/domega
        f[(2, 6)] = -vx * dt * sin_wdt - vy * dt * cos_wdt;
        // dvy/domega
        f[(3, 6)] = vx * dt * cos_wdt - vy * dt * sin_wdt;

        f
    }

    fn process_noise(&self, dt: f64) -> StateMat {
        build_process_noise(dt, self.sigma_a_xy, self.sigma_a_z, self.sigma_omega)
    }
}
