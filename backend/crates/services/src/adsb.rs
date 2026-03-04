use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;

use crate::aircraft::{Aircraft, AircraftSource};

const ADSB_BASE_URL: &str = "https://api.adsb.lol/v2";
const ADSB_MIL_URL: &str = "https://api.adsb.lol/v2/mil";
const FEET_TO_METERS: f64 = 0.3048;
const KNOTS_TO_MS: f64 = 0.514_44;
const FPM_TO_MS: f64 = 1.0 / 196.85;

/// Max radius supported by adsb.lol regional endpoint (nautical miles).
const REGION_RADIUS_NM: u32 = 250;

/// Timeout per regional request.
const REGION_TIMEOUT: Duration = Duration::from_secs(15);

/// Strategic grid points covering major air-traffic corridors worldwide.
/// Each point is queried with a 250 nm radius — together they capture
/// the vast majority of global civil aviation traffic.
const GRID_POINTS: &[(f64, f64)] = &[
    // ── Europe ────────────────────────────────────────
    (48.0, 2.0),  // France
    (51.5, -1.0), // UK
    (52.0, 13.0), // Germany
    (41.0, 12.0), // Italy
    (40.0, -4.0), // Spain
    (60.0, 15.0), // Scandinavia
    (55.0, 25.0), // Eastern Europe / Baltics
    (45.0, 30.0), // Turkey / Black Sea
    (38.0, 24.0), // Greece / East Med
    (47.0, 8.0),  // Switzerland / Central Europe
    // ── North America ─────────────────────────────────
    (42.0, -74.0),  // US Northeast
    (34.0, -84.0),  // US Southeast
    (41.0, -88.0),  // US Midwest
    (33.0, -97.0),  // US South-Central
    (40.0, -105.0), // US Mountain
    (37.0, -122.0), // US West Coast
    (48.0, -122.0), // US Pacific Northwest
    (26.0, -80.0),  // Florida / Caribbean
    (45.0, -75.0),  // Canada East (Montreal)
    (51.0, -114.0), // Canada West (Calgary)
    (20.0, -100.0), // Mexico
    // ── Asia ──────────────────────────────────────────
    (35.0, 140.0), // Japan
    (37.0, 127.0), // Korea
    (31.0, 121.0), // China East (Shanghai)
    (40.0, 116.0), // China North (Beijing)
    (23.0, 113.0), // China South (Guangdong)
    (13.0, 100.0), // Southeast Asia (Bangkok)
    (1.3, 104.0),  // Singapore
    (28.0, 77.0),  // India North (Delhi)
    (13.0, 80.0),  // India South (Chennai)
    // ── Middle East ───────────────────────────────────
    (25.0, 55.0), // UAE / Gulf
    (33.0, 44.0), // Iraq / Levant
    // ── South America ─────────────────────────────────
    (-23.0, -47.0), // Brazil (São Paulo)
    (-34.0, -58.0), // Argentina (Buenos Aires)
    (-5.0, -35.0),  // Brazil North
    // ── Africa ────────────────────────────────────────
    (34.0, -7.0),  // Morocco
    (-26.0, 28.0), // South Africa
    (6.0, 3.0),    // Nigeria / West Africa
    (0.0, 37.0),   // East Africa (Kenya)
    // ── Oceania ───────────────────────────────────────
    (-34.0, 151.0), // Australia (Sydney)
    (-37.0, 175.0), // New Zealand
    // ── Ocean corridors ───────────────────────────────
    (55.0, -30.0),  // North Atlantic
    (30.0, -150.0), // Pacific (Hawaii corridor)
];

#[derive(Debug, thiserror::Error)]
pub enum AdsbError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("failed to parse adsb.lol response: {0}")]
    Parse(String),
}

#[derive(Debug, Deserialize)]
struct AdsbResponse {
    ac: Option<Vec<AdsbAircraft>>,
}

/// Represents the altitude field which can be a number or the string "ground".
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AltitudeBaro {
    Feet(f64),
    #[allow(dead_code)]
    Ground(String),
}

#[derive(Debug, Deserialize)]
struct AdsbAircraft {
    hex: Option<String>,
    flight: Option<String>,
    r: Option<String>,
    t: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    alt_baro: Option<AltitudeBaro>,
    gs: Option<f64>,
    track: Option<f64>,
    baro_rate: Option<f64>,
    squawk: Option<String>,
    seen: Option<f64>,
    #[serde(rename = "dbFlags")]
    db_flags: Option<u32>,
}

impl AdsbAircraft {
    fn into_aircraft(self, force_military: bool) -> Option<Aircraft> {
        let icao = self.hex?;
        let lat = self.lat?;
        let lon = self.lon?;

        let (altitude_m, on_ground) = match self.alt_baro {
            Some(AltitudeBaro::Feet(ft)) => (ft * FEET_TO_METERS, false),
            Some(AltitudeBaro::Ground(_)) => (0.0, true),
            None => (0.0, false),
        };

        let callsign = self.flight.map(|s| s.trim().to_string());
        let is_military =
            force_military || self.db_flags.map(|flags| flags & 1 != 0).unwrap_or(false);

        Some(Aircraft {
            icao,
            callsign,
            registration: self.r,
            aircraft_type: self.t,
            lat,
            lon,
            altitude_m,
            speed_ms: self.gs.unwrap_or_default() * KNOTS_TO_MS,
            heading: self.track.unwrap_or_default(),
            vertical_rate_ms: self.baro_rate.unwrap_or_default() * FPM_TO_MS,
            on_ground,
            is_military,
            squawk: self.squawk,
            last_seen: self.seen.unwrap_or_default(),
            source: AircraftSource::AdsbLol,
        })
    }
}

fn parse_aircraft(response: AdsbResponse, force_military: bool) -> Vec<Aircraft> {
    response
        .ac
        .unwrap_or_default()
        .into_iter()
        .filter_map(|ac| ac.into_aircraft(force_military))
        .collect()
}

/// Fetch military aircraft from the adsb.lol /v2/mil endpoint.
pub async fn fetch_military(client: &reqwest::Client) -> Result<Vec<Aircraft>, AdsbError> {
    let response: AdsbResponse = client.get(ADSB_MIL_URL).send().await?.json().await?;
    Ok(parse_aircraft(response, true))
}

/// Fetch aircraft within a 250 nm radius of a single point.
async fn fetch_region(
    client: &reqwest::Client,
    lat: f64,
    lon: f64,
) -> Result<Vec<Aircraft>, AdsbError> {
    let url = format!("{ADSB_BASE_URL}/lat/{lat}/lon/{lon}/dist/{REGION_RADIUS_NM}");
    let response = client.get(&url).timeout(REGION_TIMEOUT).send().await?;

    let status = response.status();
    if !status.is_success() {
        return Err(AdsbError::Parse(format!(
            "region ({lat},{lon}) returned HTTP {status}"
        )));
    }

    let bytes = response.bytes().await?;
    let parsed: AdsbResponse = serde_json::from_slice(&bytes)
        .map_err(|e| AdsbError::Parse(format!("region ({lat},{lon}) JSON error: {e}")))?;

    Ok(parse_aircraft(parsed, false))
}

/// Fetch all aircraft globally by querying a grid of regional endpoints
/// concurrently, then deduplicating by ICAO hex.
pub async fn fetch_all_regions(client: &reqwest::Client) -> (Vec<Aircraft>, usize, usize) {
    let handles: Vec<tokio::task::JoinHandle<(f64, f64, Result<Vec<Aircraft>, AdsbError>)>> =
        GRID_POINTS
            .iter()
            .map(|&(lat, lon)| {
                let client = client.clone();
                tokio::spawn(async move {
                    let result = fetch_region(&client, lat, lon).await;
                    (lat, lon, result)
                })
            })
            .collect();

    let mut merged: HashMap<String, Aircraft> = HashMap::new();
    let total_regions = handles.len();
    let mut failed_regions: usize = 0;

    for handle in handles {
        match handle.await {
            Ok((lat, lon, Ok(aircraft))) => {
                tracing::debug!(lat, lon, count = aircraft.len(), "region query OK");
                for ac in aircraft {
                    merged.insert(ac.icao.clone(), ac);
                }
            }
            Ok((lat, lon, Err(e))) => {
                failed_regions += 1;
                tracing::warn!(lat, lon, "region query failed: {e}");
            }
            Err(e) => {
                failed_regions += 1;
                tracing::error!("region task panicked: {e}");
            }
        }
    }

    let aircraft: Vec<Aircraft> = merged.into_values().collect();
    tracing::info!(
        total = aircraft.len(),
        regions_ok = total_regions - failed_regions,
        regions_failed = failed_regions,
        "regional fetch complete"
    );

    (aircraft, total_regions, failed_regions)
}
