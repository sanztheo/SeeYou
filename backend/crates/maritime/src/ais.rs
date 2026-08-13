use std::collections::HashMap;
use std::time::Duration;

use crate::sanctions::is_sanctioned_vessel;
use crate::types::Vessel;
use anyhow::Context;
use serde::Deserialize;

/// COVERAGE LIMITATION — read before treating `/maritime` as a global layer.
///
/// This module's only data source, the Finnish Transport Infrastructure
/// Agency's digitraffic feed, is **terrestrial AIS for Finnish/Baltic
/// waters only** (measured live 2026-08-13: 1,239 vessel positions, every
/// one of them in the Baltic Sea/Gulf of Finland — e.g. a sample vessel sat
/// at 59.47N 18.75E, off Stockholm). Terrestrial AIS receivers everywhere
/// (not just this one) top out at roughly 40-75 km from the coast, so even
/// a well-resourced global terrestrial network has open-ocean gaps by
/// physics, not by choice — but digitraffic specifically doesn't attempt
/// global coverage at all: it is a Finnish national agency's own receiver
/// network, documenting Finnish/Baltic traffic, full stop.
///
/// A genuinely global *coastal* AIS source was evaluated for this app and
/// rejected, not overlooked: AISStream.io advertises worldwide receiver
/// coverage, but its terms of service could not be verified — both a direct
/// `curl` and an authenticated fetch tool returned HTTP 403 from every page
/// tried (`/`, `/terms`, `/terms-of-service`, `/tos`, `/legal`,
/// `/privacy-policy`, `/documentation`), consistent with the same
/// Cloudflare block a prior pass hit. The two other AIS candidates in
/// `docs/plans/sources.md` (Norwegian Coastal Administration, Global Fishing
/// Watch) are each regional or require a human registration step, so
/// neither closes this gap either. This app's third globally-covering
/// source is GDACS (`disasters` crate), not a maritime source — see
/// `docs/plans/sources.md` for the full evaluation.
const AIS_URL: &str = "https://meri.digitraffic.fi/api/ais/v1/locations";
/// Vessel metadata (name, call sign) — a separate digitraffic endpoint from
/// `AIS_URL`'s live positions. Needed because `AIS_URL`'s GeoJSON features
/// carry only `mmsi` in their properties, and both the sanctions match and
/// a human-readable vessel name require the name/call sign this endpoint
/// provides.
const AIS_METADATA_URL: &str = "https://meri.digitraffic.fi/api/ais/v1/vessels";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
struct VesselMetadata {
    mmsi: u64,
    name: Option<String>,
    #[serde(rename = "callSign")]
    call_sign: Option<String>,
}

fn nav_stat_type(code: u8) -> &'static str {
    match code {
        0 => "underway-engine",
        1 => "at-anchor",
        2 => "not-under-command",
        3 => "restricted-maneuverability",
        5 => "moored",
        7 => "fishing",
        8 => "sailing",
        _ => "other",
    }
}

fn parse_f64ish(val: &serde_json::Value) -> Option<f64> {
    match val {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn parse_u64ish(val: &serde_json::Value) -> Option<u64> {
    match val {
        serde_json::Value::Number(n) => n.as_u64(),
        serde_json::Value::String(s) => s.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn parse_u8ish(val: &serde_json::Value) -> Option<u8> {
    parse_u64ish(val).and_then(|v| u8::try_from(v).ok())
}

/// Vessel names/call signs, keyed by MMSI — best-effort. A metadata fetch
/// failure degrades to an empty map (every vessel falls back to no
/// name/call sign, `is_sanctioned` stays `false`) rather than failing the
/// whole `fetch_vessels` call: positions are the primary data, metadata is
/// an enrichment.
async fn fetch_vessel_metadata(client: &reqwest::Client) -> HashMap<u64, VesselMetadata> {
    let response = client
        .get(AIS_METADATA_URL)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("Digitraffic-User", "seeyou-intelligence")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await;

    let Ok(response) = response else {
        return HashMap::new();
    };
    if !response.status().is_success() {
        return HashMap::new();
    }
    let entries: Vec<VesselMetadata> = match response.json().await {
        Ok(parsed) => parsed,
        Err(_) => return HashMap::new(),
    };

    entries.into_iter().map(|entry| (entry.mmsi, entry)).collect()
}

pub async fn fetch_vessels(client: &reqwest::Client) -> anyhow::Result<Vec<Vessel>> {
    let response = client
        .get(AIS_URL)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("Digitraffic-User", "seeyou-intelligence")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("AIS request failed");

    let Ok(response) = response else {
        return Ok(Vec::new());
    };
    if !response.status().is_success() {
        return Ok(Vec::new());
    }
    let payload: serde_json::Value = match response.json().await {
        Ok(parsed) => parsed,
        Err(_) => return Ok(Vec::new()),
    };

    let features = payload
        .get("features")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // Best-effort — see `fetch_vessel_metadata`'s doc comment. Fetched once
    // per call rather than per-vessel: one extra small request, not N.
    let metadata = fetch_vessel_metadata(client).await;

    let vessels: Vec<Vessel> = features
        .into_iter()
        .filter_map(|f| {
            let feature = f.as_object()?;
            let geometry = feature.get("geometry")?.as_object()?;
            let coords = geometry.get("coordinates")?.as_array()?;
            let props = feature.get("properties")?.as_object()?;

            if coords.len() < 2 {
                return None;
            }
            let lon = parse_f64ish(&coords[0])?;
            let lat = parse_f64ish(&coords[1])?;
            let mmsi = props.get("mmsi").and_then(parse_u64ish)?;
            let nav_stat = props
                .get("navStat")
                .or_else(|| props.get("nav_stat"))
                .and_then(parse_u8ish);
            let speed_knots = props.get("sog").and_then(parse_f64ish);
            let heading = props
                .get("heading")
                .and_then(parse_f64ish)
                .or_else(|| props.get("cog").and_then(parse_f64ish));

            let meta = metadata.get(&mmsi);
            let name = meta.and_then(|m| m.name.clone());
            let call_sign = meta.and_then(|m| m.call_sign.as_deref());
            let is_sanctioned = is_sanctioned_vessel(call_sign);

            Some(Vessel {
                mmsi: mmsi.to_string(),
                name,
                imo: None,
                vessel_type: nav_stat.map(nav_stat_type).unwrap_or("unknown").to_string(),
                lon,
                lat,
                speed_knots,
                heading,
                destination: None,
                flag: None,
                is_sanctioned,
            })
        })
        .collect();

    Ok(vessels)
}
