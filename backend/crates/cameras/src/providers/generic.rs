use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

use super::CameraProvider;

const PARIS_URL: &str = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/cameras-de-circulation/records?limit=100";

pub struct GenericProvider;

// --- Paris (Mairie de Paris opendata) ---

#[derive(Debug, Deserialize)]
struct ParisRecord {
    #[serde(default)]
    nom: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    geo_point_2d: Option<ParisGeo>,
}

#[derive(Debug, Deserialize)]
struct ParisGeo {
    #[serde(default)]
    lat: f64,
    #[serde(default)]
    lon: f64,
}

#[derive(Debug, Deserialize)]
struct ParisResponse {
    #[serde(default)]
    results: Vec<ParisRecord>,
}

async fn fetch_paris(client: &reqwest::Client) -> Vec<Camera> {
    let resp = client
        .get(PARIS_URL)
        .header("User-Agent", "Mozilla/5.0 SeeYou/1.0")
        .timeout(Duration::from_secs(10))
        .send()
        .await;

    let body = match resp {
        Ok(r) => match r.json::<ParisResponse>().await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(error = %e, "Paris cameras parse failed");
                return Vec::new();
            }
        },
        Err(e) => {
            tracing::warn!(error = %e, "Paris cameras request failed");
            return Vec::new();
        }
    };

    body.results
        .into_iter()
        .filter_map(|r| {
            let geo = r.geo_point_2d?;
            if geo.lat.abs() < 0.01 || r.url.is_empty() {
                return None;
            }
            Some(Camera {
                id: format!("paris-{:.5}-{:.5}", geo.lat, geo.lon),
                name: r.nom,
                lat: geo.lat,
                lon: geo.lon,
                city: "Paris".into(),
                country: "FR".into(),
                source: "paris_opendata".into(),
                stream_url: r.url,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
            })
        })
        .collect()
}

// --- Tokyo (hardcoded well-known public cameras) ---

fn tokyo_cameras() -> Vec<Camera> {
    let cams: &[(&str, &str, f64, f64, &str)] = &[
        (
            "shibuya-crossing",
            "Shibuya Crossing",
            35.6595, 139.7004,
            "https://www.youtube.com/embed/3q6JE-XNTC0",
        ),
        (
            "tokyo-tower",
            "Tokyo Tower View",
            35.6586, 139.7454,
            "https://www.youtube.com/embed/bHZQfnHRB9o",
        ),
        (
            "shinjuku-south",
            "Shinjuku South Exit",
            35.6896, 139.7006,
            "https://www.youtube.com/embed/Mk73Ki3R0M8",
        ),
    ];
    cams.iter()
        .map(|(id, name, lat, lon, url)| Camera {
            id: format!("tokyo-{}", id),
            name: name.to_string(),
            lat: *lat,
            lon: *lon,
            city: "Tokyo".into(),
            country: "JP".into(),
            source: "generic_tokyo".into(),
            stream_url: url.to_string(),
            stream_type: StreamType::Hls,
            is_online: true,
        })
        .collect()
}

// --- Sydney (RMS NSW traffic cameras) ---

const SYDNEY_RMS_URL: &str =
    "https://api.transport.nsw.gov.au/v1/live/cameras";

#[derive(Debug, Deserialize)]
struct RmsCamera {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    href: String,
    #[serde(default)]
    view: Option<RmsView>,
}

#[derive(Debug, Deserialize)]
struct RmsView {
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
}

#[derive(Debug, Deserialize)]
struct RmsRoot {
    #[serde(default)]
    features: Vec<RmsCamera>,
}

fn hardcoded_sydney() -> Vec<Camera> {
    let cams: &[(&str, &str, f64, f64, &str)] = &[
        (
            "harbour-bridge",
            "Sydney Harbour Bridge",
            -33.8523, 151.2108,
            "https://www.rms.nsw.gov.au/trafficreports/cameras/camera_images/harbourbridge.jpg",
        ),
        (
            "m5-east",
            "M5 East Motorway",
            -33.9405, 151.1280,
            "https://www.rms.nsw.gov.au/trafficreports/cameras/camera_images/m5east.jpg",
        ),
        (
            "anzac-bridge",
            "Anzac Bridge",
            -33.8710, 151.1850,
            "https://www.rms.nsw.gov.au/trafficreports/cameras/camera_images/anzacbridge.jpg",
        ),
    ];
    cams.iter()
        .map(|(id, name, lat, lon, url)| Camera {
            id: format!("sydney-{}", id),
            name: name.to_string(),
            lat: *lat,
            lon: *lon,
            city: "Sydney".into(),
            country: "AU".into(),
            source: "rms_nsw".into(),
            stream_url: url.to_string(),
            stream_type: StreamType::ImageRefresh,
            is_online: true,
        })
        .collect()
}

async fn fetch_sydney(client: &reqwest::Client) -> Vec<Camera> {
    let resp = client
        .get(SYDNEY_RMS_URL)
        .header("User-Agent", "Mozilla/5.0 SeeYou/1.0")
        .timeout(Duration::from_secs(10))
        .send()
        .await;

    let root = match resp {
        Ok(r) => match r.json::<RmsRoot>().await {
            Ok(b) => b,
            Err(_) => return hardcoded_sydney(),
        },
        Err(_) => return hardcoded_sydney(),
    };

    if root.features.is_empty() {
        return hardcoded_sydney();
    }

    root.features
        .into_iter()
        .filter_map(|c| {
            let view = c.view?;
            if view.latitude.abs() < 0.01 || c.href.is_empty() {
                return None;
            }
            Some(Camera {
                id: format!("sydney-{}", c.id),
                name: c.title,
                lat: view.latitude,
                lon: view.longitude,
                city: "Sydney".into(),
                country: "AU".into(),
                source: "rms_nsw".into(),
                stream_url: c.href,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
            })
        })
        .collect()
}

#[async_trait]
impl CameraProvider for GenericProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let (paris, sydney) =
            tokio::join!(fetch_paris(client), fetch_sydney(client));

        let mut all = Vec::new();
        all.extend(paris);
        all.extend(tokyo_cameras());
        all.extend(sydney);

        tracing::info!(count = all.len(), "generic provider cameras");
        Ok(all)
    }

    fn source_name(&self) -> &'static str {
        "generic"
    }
}
