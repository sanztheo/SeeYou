use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::{LandingPoint, SubmarineCable};

const CABLES_URL: &str = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json";
const LANDING_URL: &str =
    "https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Deserialize)]
struct GeoJsonCollection {
    features: Vec<GeoJsonFeature>,
}

#[derive(Deserialize)]
struct GeoJsonFeature {
    properties: serde_json::Value,
    geometry: GeoJsonGeometry,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum GeoJsonGeometry {
    MultiLineString {
        coordinates: Vec<Vec<[f64; 2]>>,
    },
    Point {
        coordinates: [f64; 2],
    },
    #[serde(other)]
    Other,
}

pub async fn fetch_cables(client: &reqwest::Client) -> anyhow::Result<Vec<SubmarineCable>> {
    let resp: GeoJsonCollection = client
        .get(CABLES_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("submarine cables request failed")?
        .error_for_status()
        .context("submarine cables returned error")?
        .json()
        .await
        .context("failed to parse submarine cables response")?;

    let cables = resp
        .features
        .into_iter()
        .filter_map(|f| {
            let props = &f.properties;
            let coordinates = match f.geometry {
                GeoJsonGeometry::MultiLineString { coordinates } => {
                    coordinates.into_iter().flatten().collect::<Vec<_>>()
                }
                _ => return None,
            };
            if coordinates.is_empty() {
                return None;
            }

            Some(SubmarineCable {
                id: props
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                name: props
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                length_km: props.get("length_km").and_then(|v| v.as_f64()),
                owners: props
                    .get("owners")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                year: props.get("year").and_then(|v| v.as_str()).map(String::from),
                coordinates,
            })
        })
        .collect();

    Ok(cables)
}

pub async fn fetch_landing_points(client: &reqwest::Client) -> anyhow::Result<Vec<LandingPoint>> {
    let resp: GeoJsonCollection = client
        .get(LANDING_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("landing points request failed")?
        .error_for_status()
        .context("landing points returned error")?
        .json()
        .await
        .context("failed to parse landing points response")?;

    let points = resp
        .features
        .into_iter()
        .filter_map(|f| {
            let props = &f.properties;
            let (lon, lat) = match f.geometry {
                GeoJsonGeometry::Point { coordinates } => (coordinates[0], coordinates[1]),
                _ => return None,
            };

            Some(LandingPoint {
                id: props
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                name: props
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                lat,
                lon,
                country: None,
            })
        })
        .collect();

    Ok(points)
}
