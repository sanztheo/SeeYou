use crate::ekf::{
    default_measurement_noise, observation_matrix, state_vec, Ekf, MeasNoise, MeasVec, ObsMat,
    StateMat, StateVec,
};
use crate::models::MotionModel;

const NUM_MODELS: usize = 4;

/// Markov transition matrix — probability of switching from model i to j.
///
/// ```text
///          CV    CA    CT    CD
/// CV  [  0.85  0.05  0.05  0.05 ]
/// CA  [  0.10  0.80  0.05  0.05 ]
/// CT  [  0.10  0.05  0.80  0.05 ]
/// CD  [  0.10  0.05  0.05  0.80 ]
/// ```
fn default_transition_matrix() -> [[f64; NUM_MODELS]; NUM_MODELS] {
    [
        [0.85, 0.05, 0.05, 0.05],
        [0.10, 0.80, 0.05, 0.05],
        [0.10, 0.05, 0.80, 0.05],
        [0.10, 0.05, 0.05, 0.80],
    ]
}

/// Default initial covariance (generous — lets the filter converge fast).
fn default_initial_covariance() -> StateMat {
    StateMat::from_diagonal(&state_vec(
        500.0_f64.powi(2),  // x
        500.0_f64.powi(2),  // y
        50.0_f64.powi(2),   // vx
        50.0_f64.powi(2),   // vy
        200.0_f64.powi(2),  // z
        10.0_f64.powi(2),   // vz
        0.1_f64.powi(2),    // omega
    ))
}

/// Interacting Multiple Model filter combining CV, CA, CT, CD.
pub struct ImmEngine {
    models: Vec<Box<dyn MotionModel>>,
    filters: Vec<Ekf>,
    /// Model probabilities mu_j  (sum == 1)
    pub mu: Vec<f64>,
    transition: [[f64; NUM_MODELS]; NUM_MODELS],
    h: ObsMat,
    r: MeasNoise,
    initialised: bool,
}

impl ImmEngine {
    pub fn new(models: Vec<Box<dyn MotionModel>>) -> Self {
        assert_eq!(models.len(), NUM_MODELS);
        let n = models.len();
        let mu = vec![1.0 / n as f64; n];
        let filters = vec![Ekf::new(StateVec::zeros(), default_initial_covariance()); n];

        Self {
            models,
            filters,
            mu,
            transition: default_transition_matrix(),
            h: observation_matrix(),
            r: default_measurement_noise(),
            initialised: false,
        }
    }

    /// Initialise all filters from the first measurement.
    fn init_from_measurement(&mut self, z: &MeasVec) {
        let mut x0 = StateVec::zeros();
        for i in 0..6 {
            x0[i] = z[i];
        }
        // omega starts at 0
        let p0 = default_initial_covariance();

        for f in &mut self.filters {
            f.x = x0;
            f.p = p0;
        }
        self.initialised = true;
    }

    /// Full IMM cycle: mixing → predict → update → combination.
    /// Returns the combined state and covariance.
    pub fn step(&mut self, z: &MeasVec, dt: f64) -> (StateVec, StateMat) {
        if !self.initialised {
            self.init_from_measurement(z);
            return (self.filters[0].x, self.filters[0].p);
        }

        let n = NUM_MODELS;

        // ── Step 1: Mixing probabilities ────────────────────────
        let mut c_bar = vec![0.0; n];
        for j in 0..n {
            for i in 0..n {
                c_bar[j] += self.transition[i][j] * self.mu[i];
            }
            if c_bar[j] < 1e-30 {
                c_bar[j] = 1e-30;
            }
        }

        // mu_ij: probability that model i was active given we're now in model j
        let mut mu_mix = vec![vec![0.0; n]; n]; // mu_mix[i][j]
        for j in 0..n {
            for i in 0..n {
                mu_mix[i][j] = self.transition[i][j] * self.mu[i] / c_bar[j];
            }
        }

        // ── Step 2: Mix states and covariances ──────────────────
        let mut mixed_x = vec![StateVec::zeros(); n];
        let mut mixed_p = vec![StateMat::zeros(); n];

        for j in 0..n {
            for i in 0..n {
                mixed_x[j] += mu_mix[i][j] * self.filters[i].x;
            }
            for i in 0..n {
                let dx = self.filters[i].x - mixed_x[j];
                mixed_p[j] += mu_mix[i][j] * (self.filters[i].p + dx * dx.transpose());
            }
        }

        // ── Step 3: Predict + Update each filter ────────────────
        let mut log_likelihoods = vec![0.0_f64; n];

        for j in 0..n {
            self.filters[j].x = mixed_x[j];
            self.filters[j].p = mixed_p[j];

            let x_pred = self.models[j].predict(&self.filters[j].x, dt);
            let f_jac = self.models[j].jacobian(&self.filters[j].x, dt);
            let q = self.models[j].process_noise(dt);

            self.filters[j].predict(x_pred, &f_jac, &q);
            log_likelihoods[j] = self.filters[j].update(z, &self.h, &self.r);
        }

        // ── Step 4: Update model probabilities ──────────────────
        // Use log-sum-exp for numerical stability
        let max_ll = log_likelihoods
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max);

        let mut weights = vec![0.0; n];
        let mut sum = 0.0;
        for j in 0..n {
            weights[j] = c_bar[j] * (log_likelihoods[j] - max_ll).exp();
            sum += weights[j];
        }
        if sum < 1e-30 {
            sum = 1e-30;
        }
        for j in 0..n {
            self.mu[j] = weights[j] / sum;
        }

        // ── Step 5: Combined output ─────────────────────────────
        let mut x_combined = StateVec::zeros();
        for j in 0..n {
            x_combined += self.mu[j] * self.filters[j].x;
        }

        let mut p_combined = StateMat::zeros();
        for j in 0..n {
            let dx = self.filters[j].x - x_combined;
            p_combined += self.mu[j] * (self.filters[j].p + dx * dx.transpose());
        }

        (x_combined, p_combined)
    }

    /// Model probabilities [CV, CA, CT, CD].
    pub fn probabilities(&self) -> [f64; NUM_MODELS] {
        let mut out = [0.0; NUM_MODELS];
        out.copy_from_slice(&self.mu);
        out
    }

    /// The index of the most-probable model right now.
    pub fn dominant_model(&self) -> usize {
        self.mu
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap_or(0)
    }

    /// Current combined state.
    pub fn state(&self) -> StateVec {
        let mut x = StateVec::zeros();
        for (j, f) in self.filters.iter().enumerate() {
            x += self.mu[j] * f.x;
        }
        x
    }

    /// Current combined covariance.
    pub fn covariance(&self) -> StateMat {
        let x = self.state();
        let mut p = StateMat::zeros();
        for (j, f) in self.filters.iter().enumerate() {
            let dx = f.x - x;
            p += self.mu[j] * (f.p + dx * dx.transpose());
        }
        p
    }

    pub fn is_initialised(&self) -> bool {
        self.initialised
    }
}
