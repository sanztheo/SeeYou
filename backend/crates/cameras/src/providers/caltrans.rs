use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

use super::CameraProvider;

const CALTRANS_D07_URL: &str =
    "https://cwwp2.dot.ca.gov/data/d7/cctv/cctvStatusD07.json";

pub struct CaltransProvider;

#[derive(Debug, Deserialize)]
struct CaltransRoot {
    data: Vec<CaltransCctv>,
}

#[derive(Debug, Deserialize)]
struct CaltransCctv {
    #[serde(default)]
    index: String,
    location: CaltransLocation,
    #[serde(rename = "imageData")]
    image_data: CaltransImage,
}

#[derive(Debug, Deserialize)]
struct CaltransLocation {
    #[serde(default)]
    #[allow(dead_code)]
    district: String,
    #[serde(rename = "locationName", default)]
    location_name: String,
    latitude: String,
    longitude: String,
}

#[derive(Debug, Deserialize)]
struct CaltransImage {
    #[serde(rename = "static", default)]
    static_urls: Vec<CaltransStatic>,
}

#[derive(Debug, Deserialize)]
struct CaltransStatic {
    #[serde(rename = "currentImageURL", default)]
    current_image_url: String,
}

fn parse_caltrans_cameras(root: CaltransRoot) -> Vec<Camera> {
    root.data
        .into_iter()
        .filter_map(|cctv| {
            let lat: f64 = cctv.location.latitude.parse().ok()?;
            let lon: f64 = cctv.location.longitude.parse().ok()?;

            if lat.abs() < 0.01 || lon.abs() < 0.01 {
                return None;
            }

            let stream_url = cctv
                .image_data
                .static_urls
                .first()
                .map(|s| s.current_image_url.clone())
                .unwrap_or_default();

            if stream_url.is_empty() {
                return None;
            }

            Some(Camera {
                id: format!("caltrans-{}", cctv.index),
                name: cctv.location.location_name,
                lat,
                lon,
                city: "Los Angeles".into(),
                country: "US".into(),
                source: "caltrans".into(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
            })
        })
        .collect()
}

#[async_trait]
impl CameraProvider for CaltransProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let root: CaltransRoot = client
            .get(CALTRANS_D07_URL)
            .send()
            .await
            .context("Caltrans request failed")?
            .error_for_status()
            .context("Caltrans returned error status")?
            .json()
            .await
            .context("Caltrans JSON parse failed")?;

        Ok(parse_caltrans_cameras(root))
    }

    fn source_name(&self) -> &'static str {
        "caltrans"
    }
}
