use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::Earthquake;

const USGS_DAY_URL: &str =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
const USGS_SIGNIFICANT_URL: &str =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct GeoJsonResponse {
    features: Vec<GeoJsonFeature>,
}

#[derive(Deserialize)]
struct GeoJsonFeature {
    id: String,
    properties: GeoJsonProperties,
    geometry: GeoJsonGeometry,
}

#[derive(Deserialize)]
struct GeoJsonProperties {
    mag: Option<f64>,
    title: Option<String>,
    time: Option<i64>,
    url: Option<String>,
    felt: Option<u32>,
    tsunami: Option<i32>,
}

#[derive(Deserialize)]
struct GeoJsonGeometry {
    coordinates: Vec<f64>,
}

fn parse_features(features: Vec<GeoJsonFeature>) -> Vec<Earthquake> {
    features
        .into_iter()
        .filter_map(|f| {
            let coords = &f.geometry.coordinates;
            if coords.len() < 3 {
                return None;
            }
            let mag = f.properties.mag.unwrap_or(0.0);
            if mag < 2.5 {
                return None;
            }

            let time_ms = f.properties.time.unwrap_or(0);
            let time = chrono::DateTime::from_timestamp_millis(time_ms)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();

            Some(Earthquake {
                id: f.id,
                title: f
                    .properties
                    .title
                    .unwrap_or_else(|| format!("M{mag:.1} Earthquake")),
                magnitude: mag,
                lon: coords[0],
                lat: coords[1],
                depth_km: coords[2],
                time,
                url: f.properties.url,
                felt: f.properties.felt,
                tsunami: f.properties.tsunami.map(|t| t > 0).unwrap_or(false),
            })
        })
        .collect()
}

pub async fn fetch_earthquakes(client: &reqwest::Client) -> anyhow::Result<Vec<Earthquake>> {
    let resp: GeoJsonResponse = client
        .get(USGS_DAY_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("USGS earthquake request failed")?
        .error_for_status()
        .context("USGS returned error status")?
        .json()
        .await
        .context("failed to parse USGS response")?;

    Ok(parse_features(resp.features))
}

pub async fn fetch_significant(client: &reqwest::Client) -> anyhow::Result<Vec<Earthquake>> {
    let resp: GeoJsonResponse = client
        .get(USGS_SIGNIFICANT_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("USGS significant request failed")?
        .error_for_status()
        .context("USGS significant returned error")?
        .json()
        .await
        .context("failed to parse USGS significant response")?;

    Ok(parse_features(resp.features))
}
