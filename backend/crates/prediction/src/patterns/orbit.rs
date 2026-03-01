use crate::history::HistoryBuffer;
use crate::patterns::MilitaryPattern;

/// Heading variance threshold to consider "turning a lot".
const HEADING_VAR_THRESHOLD: f64 = 0.25;

/// Minimum number of points to attempt circle fit.
const MIN_POINTS: usize = 20;

/// Detect racetrack / orbit pattern.
///
/// Heuristic: high heading variance (aircraft is constantly turning)
/// combined with a successful circle fit.
pub fn detect(history: &HistoryBuffer) -> Option<MilitaryPattern> {
    if history.heading_variance() < HEADING_VAR_THRESHOLD {
        return None;
    }
    if history.len() < MIN_POINTS {
        return None;
    }

    // Algebraic circle fit (Kåsa method):
    //   minimise Σ (x_i² + y_i² - 2*cx*x_i - 2*cy*y_i - (R² - cx² - cy²))²
    //   which reduces to a 3x3 linear system.
    let pts = history.points();
    let n = pts.len() as f64;

    let (mut sx, mut sy) = (0.0, 0.0);
    for p in pts {
        sx += p.lon;
        sy += p.lat;
    }
    let cx_approx = sx / n;
    let cy_approx = sy / n;

    // Work in local coords (degrees offset from centroid, fine for ~100 km)
    let mut suu = 0.0;
    let mut suv = 0.0;
    let mut svv = 0.0;
    let mut suuu = 0.0;
    let mut svvv = 0.0;
    let mut suvv = 0.0;
    let mut svuu = 0.0;

    for p in pts {
        let u = p.lon - cx_approx;
        let v = p.lat - cy_approx;
        let uu = u * u;
        let vv = v * v;
        suu += uu;
        suv += u * v;
        svv += vv;
        suuu += uu * u;
        svvv += vv * v;
        suvv += u * vv;
        svuu += v * uu;
    }

    let a = 2.0 * (suu * svv - suv * suv);
    if a.abs() < 1e-15 {
        return None;
    }

    let uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / a;
    let vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / a;

    let center_lon = uc + cx_approx;
    let center_lat = vc + cy_approx;

    // Radius in degrees → convert to metres (approx)
    let r_deg_sq = uc * uc + vc * vc + (suu + svv) / n;
    if r_deg_sq < 0.0 {
        return None;
    }
    let r_deg = r_deg_sq.sqrt();

    let m_per_deg_lat = 111_320.0;
    let m_per_deg_lon = 111_320.0 * center_lat.to_radians().cos();
    let radius_m = r_deg * ((m_per_deg_lat + m_per_deg_lon) / 2.0);

    // Plausibility: military orbits are typically 5-80 km radius
    if !(2_000.0..=150_000.0).contains(&radius_m) {
        return None;
    }

    // Verify residuals: points should cluster near the circle
    let mut rms_err = 0.0;
    for p in pts {
        let u = p.lon - cx_approx;
        let v = p.lat - cy_approx;
        let d = ((u - uc).powi(2) + (v - vc).powi(2)).sqrt();
        rms_err += (d - r_deg).powi(2);
    }
    rms_err = (rms_err / n).sqrt();

    // Reject if RMS error > 30% of radius
    if rms_err > 0.3 * r_deg {
        return None;
    }

    Some(MilitaryPattern::Orbit {
        center_lat,
        center_lon,
        radius_m,
    })
}
