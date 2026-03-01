use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuroraPoint {
    pub lat: f64,
    pub lon: f64,
    pub probability: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceWeatherAlert {
    pub product_id: String,
    pub issue_time: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceWeatherResponse {
    pub aurora: Vec<AuroraPoint>,
    pub kp_index: f64,
    pub alerts: Vec<SpaceWeatherAlert>,
    pub fetched_at: String,
}
