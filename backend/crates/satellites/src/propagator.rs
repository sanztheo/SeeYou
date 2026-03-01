use anyhow::Result;
use chrono::Utc;

use crate::types::{Satellite, TleData};

const EARTH_RADIUS_KM: f64 = 6378.137;
const EARTH_FLATTENING: f64 = 1.0 / 298.257_223_563;
const MINUTES_PER_DAY: f64 = 1440.0;

/// Julian years since J2000.0 for the current UTC instant.
fn current_epoch_j2000() -> f64 {
    let jd = Utc::now().timestamp() as f64 / 86400.0 + 2_440_587.5;
    (jd - 2_451_545.0) / 365.25
}

/// Rotate TEME (≈ECI) position to geodetic (lat °, lon °, alt km)
/// using WGS-84 ellipsoid parameters.
fn teme_to_geodetic(position: &[f64; 3], gmst: f64) -> (f64, f64, f64) {
    let (sin_g, cos_g) = gmst.sin_cos();
    let x = position[0] * cos_g + position[1] * sin_g;
    let y = -position[0] * sin_g + position[1] * cos_g;
    let z = position[2];

    let lon = y.atan2(x).to_degrees();
    let p = (x.powi(2) + y.powi(2)).sqrt();
    let e2 = EARTH_FLATTENING * (2.0 - EARTH_FLATTENING);

    // Iterative geodetic latitude (Bowring's method)
    let mut lat = (z / (p * (1.0 - e2))).atan();
    for _ in 0..10 {
        let sin_lat = lat.sin();
        let n = EARTH_RADIUS_KM / (1.0 - e2 * sin_lat.powi(2)).sqrt();
        lat = (z + e2 * n * sin_lat).atan2(p);
    }

    let sin_lat = lat.sin();
    let n = EARTH_RADIUS_KM / (1.0 - e2 * sin_lat.powi(2)).sqrt();
    let alt = if lat.cos().abs() > 1e-10 {
        p / lat.cos() - n
    } else {
        z.abs() - n * (1.0 - e2)
    };

    (lat.to_degrees(), lon, alt)
}

/// Propagate a single satellite from its TLE to the current UTC instant.
pub fn propagate_satellite(tle: &TleData) -> Result<Satellite> {
    let elements = sgp4::Elements::from_tle(
        Some(tle.name.clone()),
        tle.line1.as_bytes(),
        tle.line2.as_bytes(),
    )
    .map_err(|e| anyhow::anyhow!("TLE parse error for {}: {e:?}", tle.norad_id))?;

    let constants = sgp4::Constants::from_elements(&elements)
        .map_err(|e| anyhow::anyhow!("elements error for {}: {e:?}", tle.norad_id))?;

    let now = Utc::now().naive_utc();
    let minutes = elements
        .datetime_to_minutes_since_epoch(&now)
        .map_err(|e| anyhow::anyhow!("epoch error for {}: {e:?}", tle.norad_id))?;

    let prediction = constants
        .propagate(minutes)
        .map_err(|e| anyhow::anyhow!("propagation error for {}: {e:?}", tle.norad_id))?;

    let gmst = sgp4::iau_epoch_to_sidereal_time(current_epoch_j2000());
    let (lat, lon, altitude_km) = teme_to_geodetic(&prediction.position, gmst);

    let velocity_km_s = (prediction.velocity[0].powi(2)
        + prediction.velocity[1].powi(2)
        + prediction.velocity[2].powi(2))
    .sqrt();

    let orbit_period_min = MINUTES_PER_DAY / elements.mean_motion;

    Ok(Satellite {
        norad_id: tle.norad_id,
        name: tle.name.clone(),
        category: tle.category,
        lat,
        lon,
        altitude_km,
        velocity_km_s,
        orbit_period_min,
    })
}
