use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

use super::CameraProvider;

const TFL_JAMCAM_URL: &str = "https://api.tfl.gov.uk/Place/Type/JamCam";

pub struct TflProvider;

#[derive(Debug, Deserialize)]
struct TflPlace {
    id: String,
    #[serde(rename = "commonName")]
    common_name: String,
    lat: f64,
    lon: f64,
    #[serde(rename = "additionalProperties", default)]
    additional_properties: Vec<TflProperty>,
}

#[derive(Debug, Deserialize)]
struct TflProperty {
    key: String,
    value: String,
}

fn extract_image_url(props: &[TflProperty]) -> Option<String> {
    props
        .iter()
        .find(|p| p.key == "imageUrl")
        .map(|p| p.value.clone())
}

fn parse_tfl_cameras(places: Vec<TflPlace>) -> Vec<Camera> {
    places
        .into_iter()
        .filter_map(|place| {
            let stream_url = extract_image_url(&place.additional_properties)?;
            Some(Camera {
                id: format!("tfl-{}", place.id),
                name: place.common_name,
                lat: place.lat,
                lon: place.lon,
                city: "London".into(),
                country: "UK".into(),
                source: "tfl".into(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
            })
        })
        .collect()
}

#[async_trait]
impl CameraProvider for TflProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let places: Vec<TflPlace> = client
            .get(TFL_JAMCAM_URL)
            .send()
            .await
            .context("TfL request failed")?
            .error_for_status()
            .context("TfL returned error status")?
            .json()
            .await
            .context("TfL JSON parse failed")?;

        Ok(parse_tfl_cameras(places))
    }

    fn source_name(&self) -> &'static str {
        "tfl"
    }
}
