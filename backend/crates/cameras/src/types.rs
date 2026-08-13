use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Camera {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub city: String,
    pub country: String,
    pub source: String,
    pub stream_url: String,
    pub stream_type: StreamType,
    pub is_online: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_heading_deg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_fov_deg: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_heading_source: Option<CameraViewSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view_hint: Option<String>,
    /// Sensor horizontal resolution in pixels. No provider populates this yet
    /// (SeeYou v2 P2 — added for the camera↔aircraft pixel criterion in
    /// `visibility::assess_camera`); `None` falls back to a conservative
    /// `visibility::DEFAULT_RESOLUTION_PX` (640).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution_px: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StreamType {
    Mjpeg,
    ImageRefresh,
    Hls,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CameraViewSource {
    Provider,
    Parsed,
    Estimated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CamerasResponse {
    pub cameras: Vec<Camera>,
    pub total: usize,
}
