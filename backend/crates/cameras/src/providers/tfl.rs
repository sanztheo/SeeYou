use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, CameraViewSource, StreamType};
use crate::view::{clamp_fov_deg, default_fov_for_source, parse_heading_from_hint};

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
    extract_prop(props, "imageUrl")
}

fn extract_prop(props: &[TflProperty], key: &str) -> Option<String> {
    props.iter().find(|p| p.key == key).map(|p| p.value.clone())
}

fn parse_tfl_cameras(places: Vec<TflPlace>) -> Vec<Camera> {
    places
        .into_iter()
        .filter_map(|place| {
            let stream_url = extract_image_url(&place.additional_properties)?;
            let source = "tfl".to_string();
            let view_hint = extract_prop(&place.additional_properties, "view");
            let view_heading_deg = view_hint
                .as_deref()
                .and_then(parse_heading_from_hint)
                .or_else(|| parse_heading_from_hint(&place.common_name));
            Some(Camera {
                id: format!("tfl-{}", place.id),
                name: place.common_name,
                lat: place.lat,
                lon: place.lon,
                city: "London".into(),
                country: "UK".into(),
                source: source.clone(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
                view_heading_deg,
                view_fov_deg: Some(clamp_fov_deg(default_fov_for_source(&source))),
                view_heading_source: view_heading_deg.map(|_| CameraViewSource::Parsed),
                view_hint,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_heading_from_view_property() {
        let places = vec![TflPlace {
            id: "123".to_string(),
            common_name: "Test Junction".to_string(),
            lat: 51.5,
            lon: -0.1,
            additional_properties: vec![
                TflProperty {
                    key: "imageUrl".to_string(),
                    value: "https://example.com/cam.jpg".to_string(),
                },
                TflProperty {
                    key: "view".to_string(),
                    value: "South (Main Road)".to_string(),
                },
            ],
        }];

        let out = parse_tfl_cameras(places);
        assert_eq!(out.len(), 1);
        let cam = &out[0];
        assert_eq!(cam.view_heading_deg, Some(180.0));
        assert_eq!(cam.view_heading_source, Some(CameraViewSource::Parsed));
        assert_eq!(cam.view_hint.as_deref(), Some("South (Main Road)"));
    }
}
