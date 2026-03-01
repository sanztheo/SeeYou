use crate::history::HistoryBuffer;
use crate::patterns::MilitaryPattern;

/// Heading variance below this means "flying straight".
const HEADING_VAR_THRESHOLD: f64 = 0.02;

/// Minimum history seconds to declare transit.
const MIN_DURATION: f64 = 300.0;

/// Detect straight-line transit (ferry, deployment, ingress).
///
/// Heuristic: very low heading variance over an extended period means
/// the aircraft is flying a consistent course.
pub fn detect(history: &HistoryBuffer) -> Option<MilitaryPattern> {
    if history.heading_variance() > HEADING_VAR_THRESHOLD {
        return None;
    }
    if history.duration_secs() < MIN_DURATION {
        return None;
    }

    let heading_deg = history.mean_heading()?;
    Some(MilitaryPattern::Transit { heading_deg })
}
