use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

use super::CameraProvider;

const NYCDOT_CAMERAS_URL: &str = "https://webcams.nyctmc.org/api/cameras/";

pub struct NycdotProvider;

#[derive(Debug, Deserialize)]
struct NycCamera {
    id: String,
    name: String,
    latitude: f64,
    longitude: f64,
    #[serde(rename = "imageUrl", alias = "url", default)]
    image_url: String,
    #[serde(default)]
    is_online: bool,
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
            Camera {
                id: format!("nyc-{}", c.id),
                name: c.name,
                lat: c.latitude,
                lon: c.longitude,
                city: "New York".into(),
                country: "US".into(),
                source: "nycdot".into(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: c.is_online,
            }
        })
        .collect()
}

#[async_trait]
impl CameraProvider for NycdotProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let cams: Vec<NycCamera> = client
            .get(NYCDOT_CAMERAS_URL)
            .send()
            .await
            .context("NYC DOT request failed")?
            .error_for_status()
            .context("NYC DOT returned error status")?
            .json()
            .await
            .context("NYC DOT JSON parse failed")?;

        Ok(parse_nyc_cameras(cams))
    }

    fn source_name(&self) -> &'static str {
        "nycdot"
    }
}
