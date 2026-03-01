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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StreamType {
    Mjpeg,
    ImageRefresh,
    Hls,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CamerasResponse {
    pub cameras: Vec<Camera>,
    pub total: usize,
}
