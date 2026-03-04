use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::types::{Camera, CameraViewSource, StreamType};
use crate::view::{clamp_fov_deg, default_fov_for_source, parse_heading_from_hint};

use super::CameraProvider;

struct District {
    num: &'static str,
    city: &'static str,
}

const DISTRICTS: &[District] = &[
    District { num: "03", city: "Sacramento" },
    District { num: "04", city: "San Francisco" },
    District { num: "05", city: "San Luis Obispo" },
    District { num: "06", city: "Fresno" },
    District { num: "07", city: "Los Angeles" },
    District { num: "08", city: "San Bernardino" },
    District { num: "11", city: "San Diego" },
    District { num: "12", city: "Orange County" },
];

fn district_url(num: &str) -> String {
    format!(
        "https://cwwp2.dot.ca.gov/data/d{}/cctv/cctvStatusD{}.json",
        num.trim_start_matches('0'),
        num
    )
}

pub struct CaltransProvider;

#[derive(Debug, Deserialize)]
struct CaltransRoot {
    #[serde(default)]
    data: Vec<CaltransCctv>,
}

#[derive(Debug, Deserialize)]
struct CaltransCctv {
    #[serde(default)]
    index: String,
    #[serde(default)]
    location: CaltransLocation,
    #[serde(rename = "imageData", default)]
    image_data: CaltransImage,
}

#[derive(Debug, Deserialize, Default)]
struct CaltransLocation {
    #[serde(default)]
    district: String,
    #[serde(rename = "locationName", default)]
    location_name: String,
    #[serde(default)]
    latitude: String,
    #[serde(default)]
    longitude: String,
    #[serde(default)]
    direction: String,
}

#[derive(Debug, Deserialize, Default)]
struct CaltransImage {
    #[serde(rename = "streamingVideoURL", default)]
    streaming_video_url: String,
    #[serde(rename = "static", default)]
    static_urls: CaltransStaticData,
}

#[derive(Debug, Deserialize, Default)]
#[serde(untagged)]
enum CaltransStaticData {
    One(CaltransStatic),
    #[default]
    Many(Vec<CaltransStatic>),
}

#[derive(Debug, Deserialize, Default)]
struct CaltransStatic {
    #[serde(rename = "currentImageURL", default)]
    current_image_url: String,
}

fn extract_static_url(image: &CaltransImage) -> Option<String> {
    let url = match &image.static_urls {
        CaltransStaticData::One(item) => item.current_image_url.clone(),
        CaltransStaticData::Many(items) => items
            .first()
            .map(|s| s.current_image_url.clone())
            .unwrap_or_default(),
    };
    (!url.is_empty()).then_some(url)
}

fn parse_cctv_list(cctvs: Vec<CaltransCctv>, city: &str) -> Vec<Camera> {
    cctvs
        .into_iter()
        .filter_map(|cctv| {
            let lat: f64 = cctv.location.latitude.parse().ok()?;
            let lon: f64 = cctv.location.longitude.parse().ok()?;
            if lat.abs() < 0.01 || lon.abs() < 0.01 {
                return None;
            }
            let static_url = extract_static_url(&cctv.image_data);
            let has_stream = !cctv.image_data.streaming_video_url.is_empty();

            if static_url.is_none() && !has_stream {
                return None;
            }
            let (stream_url, stream_type) = if let Some(url) = static_url {
                (url, StreamType::ImageRefresh)
            } else {
                (
                    cctv.image_data.streaming_video_url.clone(),
                    StreamType::Hls,
                )
            };

            let district = &cctv.location.district;
            let source = "caltrans".to_string();
            let view_hint = (!cctv.location.direction.is_empty())
                .then(|| cctv.location.direction.clone());
            let view_heading_deg = parse_heading_from_hint(&cctv.location.direction);
            Some(Camera {
                id: format!("caltrans-d{}-{}", district, cctv.index),
                name: cctv.location.location_name,
                lat,
                lon,
                city: city.into(),
                country: "US".into(),
                source: source.clone(),
                stream_url,
                stream_type,
                is_online: true,
                view_heading_deg,
                view_fov_deg: Some(clamp_fov_deg(default_fov_for_source(&source))),
                view_heading_source: view_heading_deg.map(|_| CameraViewSource::Provider),
                view_hint,
            })
        })
        .collect()
}

/// Try wrapped `{ "data": [...] }` first, fall back to bare array.
fn parse_response(text: &str) -> Result<Vec<CaltransCctv>> {
    let value: Value = serde_json::from_str(text)?;

    if let Some(data) = value.get("data").and_then(|v| v.as_array()) {
        if !data.is_empty() {
            let has_nested_cctv = data
                .iter()
                .any(|item| item.get("cctv").map(|v| !v.is_null()).unwrap_or(false));
            if has_nested_cctv {
                let mut out = Vec::with_capacity(data.len());
                for item in data {
                    if let Some(cctv) = item.get("cctv") {
                        let parsed: CaltransCctv = serde_json::from_value(cctv.clone())?;
                        out.push(parsed);
                    }
                }
                if !out.is_empty() {
                    return Ok(out);
                }
            }

            if let Ok(parsed) = serde_json::from_value::<Vec<CaltransCctv>>(Value::Array(data.clone())) {
                if !parsed.is_empty() {
                    return Ok(parsed);
                }
            }
        }
    }

    if let Ok(root) = serde_json::from_str::<CaltransRoot>(text) {
        if !root.data.is_empty() {
            return Ok(root.data);
        }
    }

    if let Ok(parsed) = serde_json::from_str::<Vec<CaltransCctv>>(text) {
        return Ok(parsed);
    }

    Err(anyhow::anyhow!("unsupported Caltrans response format"))
}

async fn fetch_district(
    client: &reqwest::Client,
    district: &District,
) -> Result<Vec<Camera>> {
    let url = district_url(district.num);
    let text = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("Caltrans D{} request failed", district.num))?
        .error_for_status()
        .with_context(|| format!("Caltrans D{} error status", district.num))?
        .text()
        .await
        .with_context(|| format!("Caltrans D{} body read failed", district.num))?;

    let cctvs = parse_response(&text)
        .with_context(|| format!("Caltrans D{} JSON parse failed", district.num))?;
    Ok(parse_cctv_list(cctvs, district.city))
}

#[async_trait]
impl CameraProvider for CaltransProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let mut all = Vec::new();
        for district in DISTRICTS {
            match fetch_district(client, district).await {
                Ok(cams) => {
                    tracing::debug!(
                        district = district.num,
                        count = cams.len(),
                        "caltrans district ok"
                    );
                    all.extend(cams);
                }
                Err(e) => {
                    tracing::warn!(
                        district = district.num,
                        error = %e,
                        "caltrans district failed, skipping"
                    );
                }
            }
        }
        Ok(all)
    }

    fn source_name(&self) -> &'static str {
        "caltrans"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_response_accepts_nested_data_cctv_shape() {
        let json = serde_json::json!({
            "data": [
                {
                    "cctv": {
                        "index": "1",
                        "location": {
                            "district": "4",
                            "locationName": "I-580 Westbound",
                            "latitude": "37.82539",
                            "longitude": "-122.27291",
                            "direction": "West"
                        },
                        "imageData": {
                            "streamingVideoURL": "https://example.com/live.m3u8",
                            "static": {
                                "currentImageURL": "https://example.com/current.jpg"
                            }
                        }
                    }
                }
            ]
        });

        let parsed = parse_response(&json.to_string()).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].location.direction, "West");
        assert_eq!(
            extract_static_url(&parsed[0].image_data).as_deref(),
            Some("https://example.com/current.jpg")
        );
    }

    #[test]
    fn parse_cctv_list_sets_orientation_metadata() {
        let cctv = CaltransCctv {
            index: "1".to_string(),
            location: CaltransLocation {
                district: "4".to_string(),
                location_name: "I-580 Westbound".to_string(),
                latitude: "37.82539".to_string(),
                longitude: "-122.27291".to_string(),
                direction: "West".to_string(),
            },
            image_data: CaltransImage {
                streaming_video_url: String::new(),
                static_urls: CaltransStaticData::One(CaltransStatic {
                    current_image_url: "https://example.com/current.jpg".to_string(),
                }),
            },
        };

        let out = parse_cctv_list(vec![cctv], "Oakland");
        assert_eq!(out.len(), 1);
        let cam = &out[0];
        assert_eq!(cam.view_heading_deg, Some(270.0));
        assert_eq!(cam.view_heading_source, Some(CameraViewSource::Provider));
        assert_eq!(cam.view_fov_deg, Some(42.0));
        assert_eq!(cam.view_hint.as_deref(), Some("West"));
    }
}
