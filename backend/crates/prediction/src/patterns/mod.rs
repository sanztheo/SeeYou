pub mod cap;
pub mod orbit;
pub mod transit;

use serde::{Deserialize, Serialize};

use crate::history::HistoryBuffer;

/// Recognised military flight patterns.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MilitaryPattern {
    /// Racetrack / holding orbit around a centre with estimated radius.
    Orbit {
        center_lat: f64,
        center_lon: f64,
        radius_m: f64,
    },
    /// Combat Air Patrol: back-and-forth between two endpoints.
    Cap {
        wp1_lat: f64,
        wp1_lon: f64,
        wp2_lat: f64,
        wp2_lon: f64,
    },
    /// Straight-line transit (ferry / deployment).
    Transit {
        heading_deg: f64,
    },
    /// Holding in a small area (low net displacement).
    Holding {
        center_lat: f64,
        center_lon: f64,
    },
}

/// Minimum history duration (seconds) before pattern detection kicks in.
const MIN_HISTORY_SECS: f64 = 120.0;

/// Run all detectors and return the best match, if any.
pub fn detect(history: &HistoryBuffer) -> Option<MilitaryPattern> {
    if history.duration_secs() < MIN_HISTORY_SECS || history.len() < 10 {
        return None;
    }

    // Priority: Orbit > CAP > Holding > Transit
    if let Some(pat) = orbit::detect(history) {
        return Some(pat);
    }
    if let Some(pat) = cap::detect(history) {
        return Some(pat);
    }

    let sr = history.straightness_ratio();
    if sr < 0.3 {
        let pts = history.points();
        let (mut sum_lat, mut sum_lon, n) = (0.0, 0.0, pts.len() as f64);
        for p in pts {
            sum_lat += p.lat;
            sum_lon += p.lon;
        }
        return Some(MilitaryPattern::Holding {
            center_lat: sum_lat / n,
            center_lon: sum_lon / n,
        });
    }

    if let Some(pat) = transit::detect(history) {
        return Some(pat);
    }

    None
}
