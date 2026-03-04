use std::collections::HashMap;
use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, CameraViewSource, StreamType};
use crate::view::{clamp_fov_deg, default_fov_for_source, parse_heading_from_hint};

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
    #[serde(default)]
    direction: String,
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

fn parse_states(states: &StateMap) -> Vec<Camera> {
    let mut cameras = Vec::new();
    let mut idx: u32 = 0;

    for (state, cities) in states {
        for (city, cams) in cities {
            for cam in cams {
                if cam.latitude.abs() < 0.01 || cam.url.is_empty() {
                    continue;
                }

                let source = format!("otcmap_{}", state.to_lowercase().replace(' ', "_"));
                let view_heading_deg = parse_heading_from_hint(&cam.direction);
                let view_hint = (!cam.direction.is_empty()).then(|| cam.direction.clone());

                cameras.push(Camera {
                    id: format!("otc-{idx}"),
                    name: cam.description.clone(),
                    lat: cam.latitude,
                    lon: cam.longitude,
                    city: city.clone(),
                    country: "US".into(),
                    source: source.clone(),
                    stream_url: cam.url.clone(),
                    stream_type: map_stream_type(&cam.format),
                    is_online: true,
                    view_heading_deg,
                    view_fov_deg: Some(clamp_fov_deg(default_fov_for_source(&source))),
                    view_heading_source: view_heading_deg.map(|_| CameraViewSource::Provider),
                    view_hint,
                });
                idx += 1;
            }
        }
    }

    cameras
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

        let cameras = parse_states(&states);

        tracing::info!(count = cameras.len(), "OTC Map cameras loaded");
        Ok(cameras)
    }

    fn source_name(&self) -> &'static str {
        "otcmap"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_provider_direction_when_present() {
        let states: StateMap = serde_json::from_value(serde_json::json!({
            "Alabama": {
                "Mobile": [
                    {
                        "description": "I-10 McDonald Rd",
                        "latitude": 30.53555,
                        "longitude": -88.23918,
                        "direction": "E",
                        "url": "https://example.com/cam.m3u8",
                        "encoding": "H.264",
                        "format": "M3U8"
                    }
                ]
            }
        }))
        .unwrap();

        let cameras = parse_states(&states);
        assert_eq!(cameras.len(), 1);
        let c = &cameras[0];
        assert_eq!(c.view_heading_deg, Some(90.0));
        assert_eq!(c.view_heading_source, Some(CameraViewSource::Provider));
        assert_eq!(c.view_hint.as_deref(), Some("E"));
        assert_eq!(c.view_fov_deg, Some(42.0));
    }
}
