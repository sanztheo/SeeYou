use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::Vessel;

const AIS_URL: &str = "https://meri.digitraffic.fi/api/ais/v1/locations";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct AisResponse {
    features: Vec<AisFeature>,
}

#[derive(Deserialize)]
struct AisFeature {
    mmsi: u64,
    geometry: AisGeometry,
    properties: AisProperties,
}

#[derive(Deserialize)]
struct AisGeometry {
    coordinates: Vec<f64>,
}

#[derive(Deserialize)]
struct AisProperties {
    mmsi: u64,
    sog: Option<f64>,
    cog: Option<f64>,
    heading: Option<u16>,
    #[serde(alias = "navStat")]
    nav_stat: Option<u8>,
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

pub async fn fetch_vessels(client: &reqwest::Client) -> anyhow::Result<Vec<Vessel>> {
    let resp: AisResponse = client
        .get(AIS_URL)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("Digitraffic-User", "seeyou-intelligence")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("AIS request failed")?
        .error_for_status()
        .context("AIS returned error")?
        .json()
        .await
        .context("failed to parse AIS response")?;

    let vessels: Vec<Vessel> = resp
        .features
        .into_iter()
        .filter_map(|f| {
            let coords = &f.geometry.coordinates;
            if coords.len() < 2 {
                return None;
            }

            Some(Vessel {
                mmsi: f.properties.mmsi.to_string(),
                name: None,
                imo: None,
                vessel_type: f
                    .properties
                    .nav_stat
                    .map(nav_stat_type)
                    .unwrap_or("unknown")
                    .to_string(),
                lon: coords[0],
                lat: coords[1],
                speed_knots: f.properties.sog,
                heading: f.properties.heading.map(|h| h as f64).or(f.properties.cog),
                destination: None,
                flag: None,
                is_sanctioned: false,
            })
        })
        .collect();

    Ok(vessels)
}
