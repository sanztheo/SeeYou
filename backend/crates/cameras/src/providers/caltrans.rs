use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

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
}

#[derive(Debug, Deserialize, Default)]
struct CaltransImage {
    #[serde(rename = "static", default)]
    static_urls: Vec<CaltransStatic>,
}

#[derive(Debug, Deserialize)]
struct CaltransStatic {
    #[serde(rename = "currentImageURL", default)]
    current_image_url: String,
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
            let stream_url = cctv
                .image_data
                .static_urls
                .first()
                .map(|s| s.current_image_url.clone())
                .unwrap_or_default();
            if stream_url.is_empty() {
                return None;
            }
            let district = &cctv.location.district;
            Some(Camera {
                id: format!("caltrans-d{}-{}", district, cctv.index),
                name: cctv.location.location_name,
                lat,
                lon,
                city: city.into(),
                country: "US".into(),
                source: "caltrans".into(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
            })
        })
        .collect()
}

/// Try wrapped `{ "data": [...] }` first, fall back to bare array.
fn parse_response(text: &str) -> Result<Vec<CaltransCctv>> {
    if let Ok(root) = serde_json::from_str::<CaltransRoot>(text) {
        if !root.data.is_empty() {
            return Ok(root.data);
        }
    }
    Ok(serde_json::from_str::<Vec<CaltransCctv>>(text)?)
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
