use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, CameraViewSource, StreamType};
use crate::view::{clamp_fov_deg, default_fov_for_source, parse_heading_from_hint};

use super::CameraProvider;

const NYCDOT_CAMERAS_URL: &str = "https://webcams.nyctmc.org/api/cameras/";

pub struct NycdotProvider;

#[derive(Debug, Deserialize)]
struct NycCamera {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
    #[serde(rename = "imageUrl", alias = "url", default)]
    image_url: String,
    #[serde(default)]
    is_online: bool,
    #[serde(default, alias = "direction", alias = "view", alias = "orientation")]
    direction: String,
}

fn build_image_url(cam: &NycCamera) -> String {
    if !cam.image_url.is_empty() {
        return cam.image_url.clone();
    }
    format!(
        "https://webcams.nyctmc.org/api/cameras/{}/image",
        cam.id
    )
}

fn parse_nyc_cameras(raw: Vec<NycCamera>) -> Vec<Camera> {
    raw.into_iter()
        .filter(|c| c.latitude.abs() > 0.01 && c.longitude.abs() > 0.01)
        .map(|c| {
            let stream_url = build_image_url(&c);
            let source = "nycdot".to_string();
            let heading_from_direction = parse_heading_from_hint(&c.direction);
            let heading_from_name = parse_heading_from_hint(&c.name);
            let view_heading_deg = heading_from_direction.or(heading_from_name);
            let view_heading_source = if heading_from_direction.is_some() {
                Some(CameraViewSource::Provider)
            } else if heading_from_name.is_some() {
                Some(CameraViewSource::Parsed)
            } else {
                None
            };
            Camera {
                id: format!("nyc-{}", c.id),
                name: c.name,
                lat: c.latitude,
                lon: c.longitude,
                city: "New York".into(),
                country: "US".into(),
                source: source.clone(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: c.is_online,
                view_heading_deg,
                view_fov_deg: Some(clamp_fov_deg(default_fov_for_source(&source))),
                view_heading_source,
                view_hint: (!c.direction.is_empty()).then_some(c.direction),
            }
        })
        .collect()
}

#[async_trait]
impl CameraProvider for NycdotProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let resp = client
            .get(NYCDOT_CAMERAS_URL)
            .header("User-Agent", "Mozilla/5.0 SeeYou/1.0")
            .header("Accept", "application/json")
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .context("NYC DOT request failed")?
            .error_for_status()
            .context("NYC DOT returned error status")?;

        let cams: Vec<NycCamera> = resp
            .json()
            .await
            .context("NYC DOT JSON parse failed")?;

        Ok(parse_nyc_cameras(cams))
    }

    fn source_name(&self) -> &'static str {
        "nycdot"
    }
}
