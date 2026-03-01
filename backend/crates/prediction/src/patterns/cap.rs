use crate::history::HistoryBuffer;
use crate::patterns::MilitaryPattern;

/// Heading variance must be moderate (not a full orbit, but not straight).
const HEADING_VAR_MIN: f64 = 0.08;
const HEADING_VAR_MAX: f64 = 0.30;

/// Detect Combat Air Patrol: back-and-forth flight between two waypoints.
///
/// Heuristic: the heading distribution is bimodal — the aircraft alternates
/// between two roughly opposite headings (~180 deg apart).  We cluster the
/// heading samples into two groups and check the angular gap.
pub fn detect(history: &HistoryBuffer) -> Option<MilitaryPattern> {
    let hv = history.heading_variance();
    if !(HEADING_VAR_MIN..=HEADING_VAR_MAX).contains(&hv) {
        return None;
    }
    if history.len() < 20 {
        return None;
    }

    let pts = history.points();

    // Collect headings and split into two clusters via k-means (k=2) on the
    // unit circle.  We start with seeds at 0° and 180° offset from the mean.
    let mean_h = history.mean_heading().unwrap_or(0.0);
    let mut c1_rad = mean_h.to_radians();
    let mut c2_rad = (mean_h + 180.0).to_radians();

    let headings_rad: Vec<f64> = pts.iter().map(|p| p.heading_deg.to_radians()).collect();

    for _ in 0..10 {
        let (mut sx1, mut sy1, mut n1) = (0.0, 0.0, 0.0_f64);
        let (mut sx2, mut sy2, mut n2) = (0.0, 0.0, 0.0_f64);

        for &h in &headings_rad {
            let d1 = angular_dist(h, c1_rad).abs();
            let d2 = angular_dist(h, c2_rad).abs();
            if d1 <= d2 {
                sx1 += h.sin();
                sy1 += h.cos();
                n1 += 1.0;
            } else {
                sx2 += h.sin();
                sy2 += h.cos();
                n2 += 1.0;
            }
        }

        if n1 > 0.0 {
            c1_rad = (sx1 / n1).atan2(sy1 / n1);
        }
        if n2 > 0.0 {
            c2_rad = (sx2 / n2).atan2(sy2 / n2);
        }
    }

    // The two cluster centroids should be roughly 180° apart (±40°)
    let gap = angular_dist(c1_rad, c2_rad).abs().to_degrees();
    if !(140.0..=220.0).contains(&gap) {
        return None;
    }

    // Find turn points (where the heading flips cluster membership) to extract endpoints
    let mut turn_lats = Vec::new();
    let mut turn_lons = Vec::new();
    let pts_vec: Vec<_> = pts.iter().collect();

    for w in pts_vec.windows(2) {
        let d1a = angular_dist(w[0].heading_deg.to_radians(), c1_rad).abs();
        let d2a = angular_dist(w[0].heading_deg.to_radians(), c2_rad).abs();
        let d1b = angular_dist(w[1].heading_deg.to_radians(), c1_rad).abs();
        let d2b = angular_dist(w[1].heading_deg.to_radians(), c2_rad).abs();

        let cluster_a = if d1a <= d2a { 0 } else { 1 };
        let cluster_b = if d1b <= d2b { 0 } else { 1 };

        if cluster_a != cluster_b {
            turn_lats.push(w[1].lat);
            turn_lons.push(w[1].lon);
        }
    }

    if turn_lats.len() < 2 {
        return None;
    }

    // Cluster turn points into two groups (near c1 direction and near c2 direction)
    let mid_lat: f64 = turn_lats.iter().sum::<f64>() / turn_lats.len() as f64;
    let mid_lon: f64 = turn_lons.iter().sum::<f64>() / turn_lons.len() as f64;

    let (mut g1_lat, mut g1_lon, mut g1_n) = (0.0, 0.0, 0.0_f64);
    let (mut g2_lat, mut g2_lon, mut g2_n) = (0.0, 0.0, 0.0_f64);

    let patrol_heading = c1_rad;
    for i in 0..turn_lats.len() {
        let dlat = turn_lats[i] - mid_lat;
        let dlon = turn_lons[i] - mid_lon;
        let proj = dlon * patrol_heading.sin() + dlat * patrol_heading.cos();
        if proj >= 0.0 {
            g1_lat += turn_lats[i];
            g1_lon += turn_lons[i];
            g1_n += 1.0;
        } else {
            g2_lat += turn_lats[i];
            g2_lon += turn_lons[i];
            g2_n += 1.0;
        }
    }

    if g1_n < 1.0 || g2_n < 1.0 {
        return None;
    }

    Some(MilitaryPattern::Cap {
        wp1_lat: g1_lat / g1_n,
        wp1_lon: g1_lon / g1_n,
        wp2_lat: g2_lat / g2_n,
        wp2_lon: g2_lon / g2_n,
    })
}

/// Signed angular distance on the unit circle.
fn angular_dist(a: f64, b: f64) -> f64 {
    let d = a - b;
    d.sin().atan2(d.cos())
}
