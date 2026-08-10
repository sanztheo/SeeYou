use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tokio::sync::Semaphore;

use crate::aircraft::{Aircraft, AircraftSource};

const FEET_TO_METERS: f64 = 0.3048;
const KNOTS_TO_MS: f64 = 0.514_44;
const FPM_TO_MS: f64 = 1.0 / 196.85;

/// Max radius supported by the regional endpoints (nautical miles).
const REGION_RADIUS_NM: u32 = 250;

/// Timeout per regional request.
const REGION_TIMEOUT: Duration = Duration::from_secs(15);

/// Minimum gap enforced between the START of two consecutive requests to
/// the SAME provider. Measured empirically against adsb.lol on 2026-08-10
/// with a throwaway calibration script (not committed): concurrent bursts
/// of 2, 4, 8 and 20 simultaneous requests all failed at ~50-100% regardless
/// of burst size (concurrency alone does not help), while a fully serial
/// stream spaced 3s apart had 0 failures over 10 consecutive requests (6s
/// spacing: 0/8; 1s spacing already produced ~30% 429s). Across the whole
/// calibration run adsb.lol answered 84 requests: 17 ok, 66 HTTP 429, 1
/// HTTP 420 -- and never once sent a `Retry-After` header on a 429 (it's a
/// bare nginx HTML error page), consistent with an edge-level per-IP
/// limiter rather than an application one. adsb.fi and airplanes.live were
/// only confirmed alive (not stress-tested, to avoid hammering third-party
/// free services beyond what's needed), so the same conservative spacing
/// is applied to all three providers rather than trusting the plan's
/// unverified ~1 req/s hypothesis for the fallbacks.
pub(crate) const MIN_REQUEST_SPACING: Duration = Duration::from_secs(3);

/// Concurrency backstop per provider. The spike showed concurrency count
/// barely changes the failure rate (2/4/8 concurrent all failed similarly);
/// what matters is the stagger schedule below. This just guards against a
/// slow request overlapping into the next scheduled slot.
const MAX_CONCURRENT_PER_PROVIDER: usize = 1;

/// Random jitter window added on top of each region's stagger schedule so
/// requests don't lock into an exact period across polling cycles.
const JITTER_MAX_MS: u64 = 400;

/// One of the three ADSBX-v2-family providers a region can be fetched from.
/// Regions are round-robined across all three (see `fetch_all_regions`)
/// because adsb.lol alone cannot serve the full 43-point grid at a usable
/// cadence within its measured ~1 request/3s budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    AdsbLol,
    AdsbFi,
    AirplanesLive,
}

const PROVIDERS: [Provider; 3] = [Provider::AdsbLol, Provider::AdsbFi, Provider::AirplanesLive];

impl Provider {
    fn base_url(self) -> &'static str {
        match self {
            Provider::AdsbLol => "https://api.adsb.lol/v2",
            Provider::AdsbFi => "https://opendata.adsb.fi/api/v2",
            Provider::AirplanesLive => "https://api.airplanes.live/v2",
        }
    }

    /// Builds the region-search URL for this provider. Confirmed by hitting
    /// all three on 2026-08-10: adsb.lol and adsb.fi share the
    /// `/lat/{lat}/lon/{lon}/dist/{nm}` shape (adsb.fi wraps the array
    /// under `"aircraft"` instead of `"ac"` -- handled uniformly by
    /// `AdsbResponse`, not here). airplanes.live 404s on that shape and
    /// instead needs `/point/{lat}/{lon}/{nm}`.
    fn region_url(self, lat: f64, lon: f64) -> String {
        let base = self.base_url();
        match self {
            Provider::AdsbLol | Provider::AdsbFi => {
                format!("{base}/lat/{lat}/lon/{lon}/dist/{REGION_RADIUS_NM}")
            }
            Provider::AirplanesLive => format!("{base}/point/{lat}/{lon}/{REGION_RADIUS_NM}"),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Provider::AdsbLol => "adsb.lol",
            Provider::AdsbFi => "adsb.fi",
            Provider::AirplanesLive => "airplanes.live",
        }
    }
}

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

    #[error("failed to parse response: {0}")]
    Parse(String),

    #[error("rate limited (retry_after={0:?}s)")]
    RateLimited(Option<u64>),
}

#[derive(Debug, Deserialize)]
struct AdsbResponse {
    /// adsb.lol / airplanes.live shape.
    ac: Option<Vec<AdsbAircraft>>,
    /// adsb.fi's regional-search shape uses this key instead of `ac` for
    /// the same array (confirmed 2026-08-10) — both are accepted uniformly
    /// so the fallback round-robin doesn't need per-provider parsing.
    aircraft: Option<Vec<AdsbAircraft>>,
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
        .or(response.aircraft)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|ac| ac.into_aircraft(force_military))
        .collect()
}

/// Classifies a response status into a rate-limit error, a generic
/// failure, or success — pulled out as a pure function so the 429 case is
/// unit-testable without constructing a real `reqwest::Response`.
fn classify_status(
    status: reqwest::StatusCode,
    retry_after_header: Option<&str>,
    context: &str,
) -> Result<(), AdsbError> {
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_after_secs = retry_after_header.and_then(|v| v.trim().parse::<u64>().ok());
        return Err(AdsbError::RateLimited(retry_after_secs));
    }

    if !status.is_success() {
        return Err(AdsbError::Parse(format!("{context} returned HTTP {status}")));
    }

    Ok(())
}

async fn parse_response(
    response: reqwest::Response,
    context: &str,
    force_military: bool,
) -> Result<Vec<Aircraft>, AdsbError> {
    let status = response.status();
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    classify_status(status, retry_after.as_deref(), context)?;

    let bytes = response.bytes().await?;
    let parsed: AdsbResponse = serde_json::from_slice(&bytes)
        .map_err(|e| AdsbError::Parse(format!("{context} JSON error: {e}")))?;

    Ok(parse_aircraft(parsed, force_military))
}

/// Fetch military aircraft from adsb.lol's `/v2/mil` endpoint. Previously
/// used `reqwest::Response::json()` directly, which decodes the body
/// unconditionally regardless of status: a 429 here returns a bare nginx
/// HTML error page (confirmed 2026-08-10), so `.json()` failed with
/// "error decoding response body" — exactly the bug this fixes by checking
/// the status first, same as `fetch_region` already did.
pub async fn fetch_military(client: &reqwest::Client) -> Result<Vec<Aircraft>, AdsbError> {
    let url = format!("{}/mil", Provider::AdsbLol.base_url());
    let response = client.get(&url).timeout(REGION_TIMEOUT).send().await?;
    parse_response(response, "adsb.lol mil", true).await
}

/// Fetch aircraft within a 250 nm radius of a single point from the given
/// provider.
async fn fetch_region(
    client: &reqwest::Client,
    provider: Provider,
    lat: f64,
    lon: f64,
) -> Result<Vec<Aircraft>, AdsbError> {
    let url = provider.region_url(lat, lon);
    let response = client.get(&url).timeout(REGION_TIMEOUT).send().await?;
    let context = format!("{} region ({lat},{lon})", provider.label());
    parse_response(response, &context, false).await
}

/// Minimal seeded xorshift — avoids pulling in the `rand` crate for a
/// single non-cryptographic jitter value. Seeded from wall-clock nanos
/// mixed with the region's coordinates and queue slot, so jitter differs
/// both across regions in the same cycle and across successive cycles.
fn jitter_millis(lat: f64, lon: f64, slot: usize) -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut x = nanos
        ^ lat.to_bits()
        ^ lon.to_bits().rotate_left(17)
        ^ (slot as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x % JITTER_MAX_MS
}

/// Delay before firing the `slot`-th request queued for a provider: spaced
/// `MIN_REQUEST_SPACING` apart plus a little jitter, so a provider's own
/// requests never bunch up into the bursts the calibration showed fail.
fn stagger_delay(slot: usize, lat: f64, lon: f64) -> Duration {
    MIN_REQUEST_SPACING.saturating_mul(slot as u32) + Duration::from_millis(jitter_millis(lat, lon, slot))
}

/// Result of a full grid sweep: the merged aircraft plus enough detail to
/// tell a rate-limit failure apart from a generic one (the whole point of
/// P0-1 point 3 — a 429 used to be indistinguishable from a malformed
/// response).
pub struct RegionFetchOutcome {
    pub aircraft: Vec<Aircraft>,
    pub regions_total: usize,
    pub regions_failed: usize,
    pub regions_rate_limited: usize,
    pub max_retry_after_secs: Option<u64>,
}

/// Fetch all aircraft globally by querying the grid of regional endpoints,
/// round-robined across three providers (adsb.lol, adsb.fi,
/// airplanes.live) and staggered/jittered within each provider's own
/// queue so no provider ever sees a burst — then deduplicating by ICAO
/// hex.
///
/// The round-robin is unconditional rather than a reactive fallback:
/// calibration measured adsb.lol's own safe budget at ~1 request/3s, which
/// makes serving all 43 regions from adsb.lol alone take ~129s/cycle. That
/// already qualifies as "durably insufficient", so splitting the grid
/// three ways from the start is simpler than adding a stateful detector
/// for a condition already proven true.
pub async fn fetch_all_regions(client: &reqwest::Client) -> RegionFetchOutcome {
    let semaphores: Vec<Arc<Semaphore>> = PROVIDERS
        .iter()
        .map(|_| Arc::new(Semaphore::new(MAX_CONCURRENT_PER_PROVIDER)))
        .collect();

    let handles: Vec<tokio::task::JoinHandle<(f64, f64, Provider, Result<Vec<Aircraft>, AdsbError>)>> =
        GRID_POINTS
            .iter()
            .enumerate()
            .map(|(i, &(lat, lon))| {
                let provider_index = i % PROVIDERS.len();
                let provider = PROVIDERS[provider_index];
                let slot = i / PROVIDERS.len();
                let delay = stagger_delay(slot, lat, lon);
                let client = client.clone();
                let semaphore = semaphores[provider_index].clone();
                tokio::spawn(async move {
                    tokio::time::sleep(delay).await;
                    let _permit = semaphore
                        .acquire()
                        .await
                        .expect("provider semaphore is never closed");
                    let result = fetch_region(&client, provider, lat, lon).await;
                    (lat, lon, provider, result)
                })
            })
            .collect();

    let mut merged: HashMap<String, Aircraft> = HashMap::new();
    let total_regions = handles.len();
    let mut failed_regions: usize = 0;
    let mut rate_limited_regions: usize = 0;
    let mut max_retry_after_secs: Option<u64> = None;

    for handle in handles {
        match handle.await {
            Ok((lat, lon, provider, Ok(aircraft))) => {
                tracing::debug!(
                    lat,
                    lon,
                    provider = provider.label(),
                    count = aircraft.len(),
                    "region query OK"
                );
                for ac in aircraft {
                    merged.insert(ac.icao.clone(), ac);
                }
            }
            Ok((lat, lon, provider, Err(AdsbError::RateLimited(retry_after_secs)))) => {
                failed_regions += 1;
                rate_limited_regions += 1;
                if let Some(secs) = retry_after_secs {
                    max_retry_after_secs = Some(max_retry_after_secs.map_or(secs, |m| m.max(secs)));
                }
                tracing::warn!(
                    lat,
                    lon,
                    provider = provider.label(),
                    ?retry_after_secs,
                    "region query rate limited"
                );
            }
            Ok((lat, lon, provider, Err(e))) => {
                failed_regions += 1;
                tracing::warn!(lat, lon, provider = provider.label(), "region query failed: {e}");
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
        regions_rate_limited = rate_limited_regions,
        "regional fetch complete"
    );

    RegionFetchOutcome {
        aircraft,
        regions_total: total_regions,
        regions_failed: failed_regions,
        regions_rate_limited: rate_limited_regions,
        max_retry_after_secs,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        classify_status, parse_aircraft, stagger_delay, AdsbError, AdsbResponse, Provider,
        GRID_POINTS, MIN_REQUEST_SPACING, PROVIDERS,
    };

    #[test]
    fn parse_aircraft_reads_ac_key() {
        let response: AdsbResponse = serde_json::from_str(
            r#"{"ac":[{"hex":"abc123","lat":48.0,"lon":2.0,"alt_baro":10000,"gs":250.0,"track":90.0}]}"#,
        )
        .unwrap();
        let aircraft = parse_aircraft(response, false);
        assert_eq!(aircraft.len(), 1);
        assert_eq!(aircraft[0].icao, "abc123");
    }

    #[test]
    fn parse_aircraft_reads_aircraft_key_adsb_fi_shape() {
        // adsb.fi's regional-search response wraps the array under
        // "aircraft" instead of "ac" (confirmed 2026-08-10).
        let response: AdsbResponse = serde_json::from_str(
            r#"{"now":1,"aircraft":[{"hex":"def456","lat":51.0,"lon":-1.0,"alt_baro":"ground","gs":0.0}],"resultCount":1,"ptime":1}"#,
        )
        .unwrap();
        let aircraft = parse_aircraft(response, false);
        assert_eq!(aircraft.len(), 1);
        assert_eq!(aircraft[0].icao, "def456");
        assert!(aircraft[0].on_ground);
    }

    #[test]
    fn parse_aircraft_defaults_to_empty_when_both_keys_absent() {
        let response: AdsbResponse = serde_json::from_str(r#"{"msg":"No aircraft"}"#).unwrap();
        assert!(parse_aircraft(response, false).is_empty());
    }

    #[test]
    fn force_military_overrides_missing_db_flags() {
        let response: AdsbResponse =
            serde_json::from_str(r#"{"ac":[{"hex":"mil001","lat":1.0,"lon":1.0}]}"#).unwrap();
        let aircraft = parse_aircraft(response, true);
        assert!(aircraft[0].is_military);
    }

    #[test]
    fn classify_status_distinguishes_rate_limit_from_other_errors() {
        let rate_limited =
            classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, Some("30"), "ctx");
        assert!(matches!(rate_limited, Err(AdsbError::RateLimited(Some(30)))));

        let rate_limited_no_header =
            classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, None, "ctx");
        assert!(matches!(rate_limited_no_header, Err(AdsbError::RateLimited(None))));

        let other_error = classify_status(reqwest::StatusCode::INTERNAL_SERVER_ERROR, None, "ctx");
        assert!(matches!(other_error, Err(AdsbError::Parse(_))));

        assert!(classify_status(reqwest::StatusCode::OK, None, "ctx").is_ok());
    }

    #[test]
    fn provider_region_url_matches_measured_shapes() {
        assert_eq!(
            Provider::AdsbLol.region_url(48.0, 2.0),
            "https://api.adsb.lol/v2/lat/48/lon/2/dist/250"
        );
        assert_eq!(
            Provider::AdsbFi.region_url(48.0, 2.0),
            "https://opendata.adsb.fi/api/v2/lat/48/lon/2/dist/250"
        );
        assert_eq!(
            Provider::AirplanesLive.region_url(48.0, 2.0),
            "https://api.airplanes.live/v2/point/48/2/250"
        );
    }

    #[test]
    fn grid_points_split_evenly_across_providers() {
        let mut counts = [0usize; 3];
        for i in 0..GRID_POINTS.len() {
            counts[i % PROVIDERS.len()] += 1;
        }
        // 43 grid points across 3 providers: adsb.lol (index 0) takes the remainder.
        assert_eq!(counts, [15, 14, 14]);
    }

    #[test]
    fn stagger_delay_grows_with_slot_and_stays_bounded_by_jitter() {
        let slot0 = stagger_delay(0, 48.0, 2.0);
        let slot1 = stagger_delay(1, 48.0, 2.0);
        assert!(slot0 < MIN_REQUEST_SPACING);
        assert!(slot1 >= MIN_REQUEST_SPACING);
        assert!(slot1 < MIN_REQUEST_SPACING * 2);
    }
}
