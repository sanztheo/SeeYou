use std::time::Duration;

use crate::types::Vessel;
use anyhow::Context;

const AIS_URL: &str = "https://meri.digitraffic.fi/api/ais/v1/locations";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

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

            Some(Vessel {
                mmsi: mmsi.to_string(),
                name: None,
                imo: None,
                vessel_type: nav_stat.map(nav_stat_type).unwrap_or("unknown").to_string(),
                lon,
                lat,
                speed_knots,
                heading,
                destination: None,
                flag: None,
                is_sanctioned: false,
            })
        })
        .collect();

    Ok(vessels)
}
