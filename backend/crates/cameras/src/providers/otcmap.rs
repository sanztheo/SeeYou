use std::collections::HashMap;
use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

use super::CameraProvider;

const DATA_URL: &str =
    "https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json";

#[derive(Debug, Deserialize)]
struct OtcCamera {
    #[serde(default)]
    description: String,
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
    #[serde(default)]
    url: String,
    #[serde(default)]
    format: String,
}

type StateMap = HashMap<String, HashMap<String, Vec<OtcCamera>>>;

pub struct OtcMapProvider;

fn map_stream_type(format: &str) -> StreamType {
    match format {
        "M3U8" | "M3U9" => StreamType::Hls,
        "IMAGE_STREAM" | "JPEG" => StreamType::ImageRefresh,
        _ => StreamType::Mjpeg,
    }
}

#[async_trait]
impl CameraProvider for OtcMapProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let body = client
            .get(DATA_URL)
            .header("User-Agent", "Mozilla/5.0 SeeYou/1.0")
            .header("Accept", "application/json")
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .context("OTC Map request failed")?
            .text()
            .await
            .context("OTC Map body read failed")?;

        let states: StateMap =
            serde_json::from_str(&body).context("OTC Map JSON parse failed")?;

        let mut cameras = Vec::new();
        let mut idx: u32 = 0;

        for (state, cities) in &states {
            for (city, cams) in cities {
                for cam in cams {
                    if cam.latitude.abs() < 0.01 || cam.url.is_empty() {
                        continue;
                    }

                    cameras.push(Camera {
                        id: format!("otc-{idx}"),
                        name: cam.description.clone(),
                        lat: cam.latitude,
                        lon: cam.longitude,
                        city: city.clone(),
                        country: "US".into(),
                        source: format!("otcmap_{}", state.to_lowercase().replace(' ', "_")),
                        stream_url: cam.url.clone(),
                        stream_type: map_stream_type(&cam.format),
                        is_online: true,
                    });
                    idx += 1;
                }
            }
        }

        tracing::info!(count = cameras.len(), "OTC Map cameras loaded");
        Ok(cameras)
    }

    fn source_name(&self) -> &'static str {
        "otcmap"
    }
}
