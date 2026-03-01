use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, StreamType};

use super::CameraProvider;

const MCP_CAMERA_URL: &str = "https://mcp.camera/api/cameras";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_CAMERAS: usize = 5_000;

pub struct McpCameraProvider;

#[derive(Debug, Deserialize)]
struct McpCamera {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    location: Option<McpLocation>,
    #[serde(default)]
    lat: Option<f64>,
    #[serde(default)]
    lon: Option<f64>,
    #[serde(default, alias = "lng")]
    longitude: Option<f64>,
    #[serde(default)]
    latitude: Option<f64>,
    #[serde(default, alias = "image_url", alias = "imageUrl", alias = "url")]
    image: Option<String>,
    #[serde(default, alias = "stream_url", alias = "streamUrl")]
    stream: Option<String>,
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct McpLocation {
    #[serde(default)]
    lat: Option<f64>,
    #[serde(default, alias = "lng")]
    lon: Option<f64>,
}

fn resolve_coords(cam: &McpCamera) -> Option<(f64, f64)> {
    if let Some(ref loc) = cam.location {
        if let (Some(lat), Some(lon)) = (loc.lat, loc.lon) {
            if lat != 0.0 || lon != 0.0 {
                return Some((lat, lon));
            }
        }
    }
    if let (Some(lat), Some(lon)) = (cam.latitude, cam.longitude) {
        if lat != 0.0 || lon != 0.0 {
            return Some((lat, lon));
        }
    }
    if let (Some(lat), Some(lon)) = (cam.lat, cam.lon) {
        if lat != 0.0 || lon != 0.0 {
            return Some((lat, lon));
        }
    }
    None
}

fn resolve_stream_url(cam: &McpCamera) -> Option<String> {
    cam.stream
        .as_deref()
        .or(cam.image.as_deref())
        .filter(|u| !u.is_empty())
        .map(String::from)
}

fn resolve_city(cam: &McpCamera) -> String {
    if let Some(ref city) = cam.city {
        if !city.is_empty() {
            return city.clone();
        }
    }
    if let Some(ref state) = cam.state {
        if !state.is_empty() {
            return state.clone();
        }
    }
    "US".into()
}

fn is_online(cam: &McpCamera) -> bool {
    cam.status
        .as_deref()
        .map(|s| {
            let s = s.to_lowercase();
            s == "online" || s == "active" || s == "up"
        })
        .unwrap_or(true)
}

fn parse_mcp_cameras(raw: Vec<McpCamera>) -> Vec<Camera> {
    raw.into_iter()
        .take(MAX_CAMERAS)
        .filter_map(|cam| {
            let (lat, lon) = resolve_coords(&cam)?;
            let stream_url = resolve_stream_url(&cam)?;
            let id = if cam.id.is_empty() {
                format!("mcp-{:.5}-{:.5}", lat, lon)
            } else {
                format!("mcp-{}", cam.id)
            };
            let city = resolve_city(&cam);
            let online = is_online(&cam);
            let name = if cam.name.is_empty() {
                format!("MCP Camera {}", id)
            } else {
                cam.name
            };

            Some(Camera {
                id,
                name,
                lat,
                lon,
                city,
                country: "US".into(),
                source: "mcp.camera".into(),
                stream_url,
                stream_type: StreamType::ImageRefresh,
                is_online: online,
            })
        })
        .collect()
}

#[async_trait]
impl CameraProvider for McpCameraProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let resp = client
            .get(MCP_CAMERA_URL)
            .timeout(REQUEST_TIMEOUT)
            .send()
            .await
            .context("mcp.camera request failed")?
            .error_for_status()
            .context("mcp.camera returned error status")?;

        let raw: Vec<McpCamera> = resp
            .json()
            .await
            .context("mcp.camera JSON parse failed")?;

        Ok(parse_mcp_cameras(raw))
    }

    fn source_name(&self) -> &'static str {
        "mcp.camera"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cam_from_json(json: serde_json::Value) -> McpCamera {
        serde_json::from_value(json).unwrap()
    }

    #[test]
    fn resolve_coords_from_location_object() {
        let cam = cam_from_json(serde_json::json!({
            "location": { "lat": 48.85, "lon": 2.35 }
        }));
        let coords = resolve_coords(&cam);
        assert_eq!(coords, Some((48.85, 2.35)));
    }

    #[test]
    fn resolve_coords_from_flat_lat_lon() {
        let cam = cam_from_json(serde_json::json!({
            "latitude": 34.05,
            "longitude": -118.25
        }));
        let coords = resolve_coords(&cam);
        assert_eq!(coords, Some((34.05, -118.25)));
    }

    #[test]
    fn resolve_coords_from_short_lat_lon() {
        let cam = cam_from_json(serde_json::json!({
            "lat": 51.50,
            "lon": -0.12
        }));
        let coords = resolve_coords(&cam);
        assert_eq!(coords, Some((51.50, -0.12)));
    }

    #[test]
    fn resolve_coords_location_takes_priority() {
        let cam = cam_from_json(serde_json::json!({
            "location": { "lat": 10.0, "lon": 20.0 },
            "latitude": 30.0,
            "longitude": 40.0
        }));
        assert_eq!(resolve_coords(&cam), Some((10.0, 20.0)));
    }

    #[test]
    fn resolve_coords_rejects_zero_zero() {
        let cam = cam_from_json(serde_json::json!({
            "lat": 0.0,
            "lon": 0.0
        }));
        assert_eq!(resolve_coords(&cam), None);
    }

    #[test]
    fn resolve_coords_zero_location_falls_through() {
        let cam = cam_from_json(serde_json::json!({
            "location": { "lat": 0.0, "lon": 0.0 },
            "latitude": 45.0,
            "longitude": 90.0
        }));
        assert_eq!(resolve_coords(&cam), Some((45.0, 90.0)));
    }

    #[test]
    fn resolve_coords_none_when_empty() {
        let cam = cam_from_json(serde_json::json!({}));
        assert_eq!(resolve_coords(&cam), None);
    }

    #[test]
    fn resolve_stream_url_from_stream() {
        let cam = cam_from_json(serde_json::json!({
            "stream": "https://example.com/stream.m3u8",
            "image": "https://example.com/thumb.jpg"
        }));
        assert_eq!(
            resolve_stream_url(&cam),
            Some("https://example.com/stream.m3u8".to_string())
        );
    }

    #[test]
    fn resolve_stream_url_falls_back_to_image() {
        let cam = cam_from_json(serde_json::json!({
            "image": "https://example.com/snap.jpg"
        }));
        assert_eq!(
            resolve_stream_url(&cam),
            Some("https://example.com/snap.jpg".to_string())
        );
    }

    #[test]
    fn resolve_stream_url_none_when_empty_string() {
        let cam = cam_from_json(serde_json::json!({
            "stream": "",
            "image": ""
        }));
        assert_eq!(resolve_stream_url(&cam), None);
    }

    #[test]
    fn resolve_stream_url_none_when_absent() {
        let cam = cam_from_json(serde_json::json!({}));
        assert_eq!(resolve_stream_url(&cam), None);
    }

    #[test]
    fn resolve_city_from_city_field() {
        let cam = cam_from_json(serde_json::json!({ "city": "Paris" }));
        assert_eq!(resolve_city(&cam), "Paris");
    }

    #[test]
    fn resolve_city_falls_back_to_state() {
        let cam = cam_from_json(serde_json::json!({ "state": "California" }));
        assert_eq!(resolve_city(&cam), "California");
    }

    #[test]
    fn resolve_city_defaults_to_us() {
        let cam = cam_from_json(serde_json::json!({}));
        assert_eq!(resolve_city(&cam), "US");
    }

    #[test]
    fn resolve_city_empty_city_falls_back() {
        let cam = cam_from_json(serde_json::json!({ "city": "", "state": "TX" }));
        assert_eq!(resolve_city(&cam), "TX");
    }

    #[test]
    fn is_online_true_for_online_status() {
        for status in &["online", "Online", "ONLINE", "active", "Active", "up", "Up"] {
            let cam = cam_from_json(serde_json::json!({ "status": status }));
            assert!(is_online(&cam), "expected online for status={status}");
        }
    }

    #[test]
    fn is_online_false_for_offline_status() {
        let cam = cam_from_json(serde_json::json!({ "status": "offline" }));
        assert!(!is_online(&cam));
    }

    #[test]
    fn is_online_defaults_to_true_when_absent() {
        let cam = cam_from_json(serde_json::json!({}));
        assert!(is_online(&cam));
    }

    #[test]
    fn parse_camera_with_all_fields() {
        let raw = vec![cam_from_json(serde_json::json!({
            "id": "cam-1",
            "name": "Downtown NYC",
            "location": { "lat": 40.71, "lon": -74.00 },
            "stream": "https://example.com/stream.m3u8",
            "city": "New York",
            "status": "online"
        }))];
        let cameras = parse_mcp_cameras(raw);
        assert_eq!(cameras.len(), 1);
        let c = &cameras[0];
        assert_eq!(c.id, "mcp-cam-1");
        assert_eq!(c.name, "Downtown NYC");
        assert!((c.lat - 40.71).abs() < 0.001);
        assert!((c.lon - (-74.00)).abs() < 0.001);
        assert_eq!(c.city, "New York");
        assert_eq!(c.country, "US");
        assert_eq!(c.source, "mcp.camera");
        assert!(matches!(c.stream_type, StreamType::ImageRefresh));
        assert!(c.is_online);
    }

    #[test]
    fn parse_camera_generates_id_when_missing() {
        let raw = vec![cam_from_json(serde_json::json!({
            "lat": 48.85,
            "lon": 2.35,
            "image": "https://example.com/img.jpg"
        }))];
        let cameras = parse_mcp_cameras(raw);
        assert_eq!(cameras.len(), 1);
        assert!(cameras[0].id.starts_with("mcp-"));
    }

    #[test]
    fn parse_camera_generates_name_when_missing() {
        let raw = vec![cam_from_json(serde_json::json!({
            "id": "x",
            "lat": 1.0,
            "lon": 1.0,
            "image": "https://example.com/img.jpg"
        }))];
        let cameras = parse_mcp_cameras(raw);
        assert!(cameras[0].name.starts_with("MCP Camera"));
    }

    #[test]
    fn parse_camera_rejects_no_stream_url() {
        let raw = vec![cam_from_json(serde_json::json!({
            "lat": 10.0,
            "lon": 20.0
        }))];
        let cameras = parse_mcp_cameras(raw);
        assert!(cameras.is_empty());
    }

    #[test]
    fn parse_camera_rejects_zero_coords() {
        let raw = vec![cam_from_json(serde_json::json!({
            "lat": 0.0,
            "lon": 0.0,
            "image": "https://example.com/img.jpg"
        }))];
        let cameras = parse_mcp_cameras(raw);
        assert!(cameras.is_empty());
    }

    #[test]
    fn parse_camera_limit_is_enforced() {
        let raw: Vec<McpCamera> = (0..MAX_CAMERAS + 100)
            .map(|i| {
                cam_from_json(serde_json::json!({
                    "id": format!("cam-{i}"),
                    "lat": 40.0 + (i as f64) * 0.001,
                    "lon": -74.0 + (i as f64) * 0.001,
                    "image": format!("https://example.com/{i}.jpg")
                }))
            })
            .collect();
        let cameras = parse_mcp_cameras(raw);
        assert_eq!(cameras.len(), MAX_CAMERAS);
    }

    #[test]
    fn lng_alias_works() {
        let cam: McpCamera = serde_json::from_value(serde_json::json!({
            "location": { "lat": 35.0, "lng": 139.0 }
        }))
        .unwrap();
        assert_eq!(cam.location.as_ref().unwrap().lon, Some(139.0));
    }

    #[test]
    fn image_url_alias_works() {
        let cam: McpCamera =
            serde_json::from_value(serde_json::json!({ "imageUrl": "https://a.com/i.jpg" }))
                .unwrap();
        assert_eq!(cam.image.as_deref(), Some("https://a.com/i.jpg"));
    }
}
