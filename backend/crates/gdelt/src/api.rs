use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::GdeltEvent;

const GDELT_GEO_URL: &str = "https://api.gdeltproject.org/api/v2/geo/geo";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct GeoJsonResponse {
    features: Option<Vec<GeoJsonFeature>>,
}

#[derive(Deserialize)]
struct GeoJsonFeature {
    properties: Option<GeoJsonProperties>,
    geometry: Option<GeoJsonGeometry>,
}

#[derive(Deserialize)]
struct GeoJsonProperties {
    url: Option<String>,
    name: Option<String>,
    #[serde(alias = "urltone")]
    tone: Option<f64>,
    domain: Option<String>,
    #[serde(alias = "sourcecountry")]
    source_country: Option<String>,
    #[serde(alias = "shareimage")]
    image_url: Option<String>,
}

#[derive(Deserialize)]
struct GeoJsonGeometry {
    coordinates: Option<Vec<f64>>,
}

pub async fn fetch_events(client: &reqwest::Client) -> anyhow::Result<Vec<GdeltEvent>> {
    let resp: GeoJsonResponse = client
        .get(GDELT_GEO_URL)
        .query(&[("query", "*"), ("format", "GeoJSON"), ("maxpoints", "500")])
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("GDELT request failed")?
        .error_for_status()
        .context("GDELT returned error status")?
        .json()
        .await
        .context("failed to parse GDELT response")?;

    let events = resp
        .features
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| {
            let props = f.properties?;
            let geo = f.geometry?;
            let coords = geo.coordinates?;
            if coords.len() < 2 {
                return None;
            }

            Some(GdeltEvent {
                url: props.url.unwrap_or_default(),
                title: props.name.unwrap_or_else(|| "Untitled".to_string()),
                lon: coords[0],
                lat: coords[1],
                tone: props.tone.unwrap_or(0.0),
                domain: props.domain.unwrap_or_default(),
                source_country: props.source_country,
                image_url: props.image_url,
            })
        })
        .collect();

    Ok(events)
}
