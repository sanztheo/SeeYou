use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Earthquake {
    pub id: String,
    pub title: String,
    pub magnitude: f64,
    pub lat: f64,
    pub lon: f64,
    pub depth_km: f64,
    pub time: String,
    pub url: Option<String>,
    pub felt: Option<u32>,
    pub tsunami: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeismicResponse {
    pub earthquakes: Vec<Earthquake>,
    pub fetched_at: String,
}
