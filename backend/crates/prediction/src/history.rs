use std::collections::VecDeque;

/// A single recorded position for pattern analysis.
#[derive(Debug, Clone, Copy)]
pub struct HistoryPoint {
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
    pub speed_ms: f64,
    pub heading_deg: f64,
    pub vrate_ms: f64,
    /// Monotonic timestamp in seconds (e.g. `Instant`-derived or UNIX epoch).
    pub t: f64,
}

/// Ring buffer holding the last `max_age_secs` of positions for one aircraft.
pub struct HistoryBuffer {
    buf: VecDeque<HistoryPoint>,
    max_age_secs: f64,
}

impl HistoryBuffer {
    pub fn new(max_age_secs: f64) -> Self {
        Self {
            buf: VecDeque::with_capacity(1024),
            max_age_secs,
        }
    }

    pub fn push(&mut self, pt: HistoryPoint) {
        self.buf.push_back(pt);
        self.prune(pt.t);
    }

    fn prune(&mut self, now: f64) {
        let cutoff = now - self.max_age_secs;
        while self.buf.front().map_or(false, |p| p.t < cutoff) {
            self.buf.pop_front();
        }
    }

    pub fn len(&self) -> usize {
        self.buf.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }

    pub fn points(&self) -> &VecDeque<HistoryPoint> {
        &self.buf
    }

    /// Duration covered by the buffer.
    pub fn duration_secs(&self) -> f64 {
        match (self.buf.front(), self.buf.back()) {
            (Some(first), Some(last)) => (last.t - first.t).max(0.0),
            _ => 0.0,
        }
    }

    /// Mean heading (circular mean to handle the 0/360 wrap).
    pub fn mean_heading(&self) -> Option<f64> {
        if self.buf.is_empty() {
            return None;
        }
        let (mut sx, mut sy) = (0.0, 0.0);
        for p in &self.buf {
            let rad = p.heading_deg.to_radians();
            sx += rad.sin();
            sy += rad.cos();
        }
        let n = self.buf.len() as f64;
        let mean_rad = (sx / n).atan2(sy / n);
        Some(mean_rad.to_degrees().rem_euclid(360.0))
    }

    /// Heading variance (circular variance ∈ [0, 1]).
    /// 0 = perfectly consistent heading, 1 = uniformly distributed.
    pub fn heading_variance(&self) -> f64 {
        if self.buf.is_empty() {
            return 0.0;
        }
        let (mut sx, mut sy) = (0.0, 0.0);
        for p in &self.buf {
            let rad = p.heading_deg.to_radians();
            sx += rad.sin();
            sy += rad.cos();
        }
        let n = self.buf.len() as f64;
        let r = (sx / n).hypot(sy / n); // mean resultant length ∈ [0, 1]
        1.0 - r
    }

    /// Net displacement vs. total path length (straightness ratio).
    /// 1.0 = perfectly straight, → 0 = looping back to origin.
    pub fn straightness_ratio(&self) -> f64 {
        if self.buf.len() < 2 {
            return 1.0;
        }
        let first = self.buf.front().unwrap();
        let last = self.buf.back().unwrap();
        let net = haversine_m(first.lat, first.lon, last.lat, last.lon);
        let mut total = 0.0;
        let v: Vec<_> = self.buf.iter().collect();
        for w in v.windows(2) {
            total += haversine_m(w[0].lat, w[0].lon, w[1].lat, w[1].lon);
        }
        if total < 1.0 {
            return 1.0;
        }
        net / total
    }

    /// Estimate turn rate (deg/s) from the most recent N points.
    pub fn recent_turn_rate(&self, n: usize) -> Option<f64> {
        let v: Vec<_> = self.buf.iter().collect();
        if v.len() < 2 {
            return None;
        }
        let start = v.len().saturating_sub(n);
        let slice = &v[start..];
        let mut total_dh = 0.0;
        let mut total_dt = 0.0;
        for w in slice.windows(2) {
            let mut dh = w[1].heading_deg - w[0].heading_deg;
            if dh > 180.0 {
                dh -= 360.0;
            }
            if dh < -180.0 {
                dh += 360.0;
            }
            let dt = w[1].t - w[0].t;
            if dt > 0.0 {
                total_dh += dh;
                total_dt += dt;
            }
        }
        if total_dt < 0.1 {
            return None;
        }
        Some(total_dh / total_dt)
    }
}

/// Haversine distance in metres.
fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const R: f64 = 6_371_000.0;
    let (dlat, dlon) = ((lat2 - lat1).to_radians(), (lon2 - lon1).to_radians());
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    2.0 * R * a.sqrt().asin()
}
