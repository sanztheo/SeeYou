use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vessel {
    pub mmsi: String,
    pub name: Option<String>,
    pub imo: Option<String>,
    pub vessel_type: String,
    pub lat: f64,
    pub lon: f64,
    pub speed_knots: Option<f64>,
    pub heading: Option<f64>,
    pub destination: Option<String>,
    pub flag: Option<String>,
    pub is_sanctioned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaritimeResponse {
    pub vessels: Vec<Vessel>,
    pub fetched_at: String,
}
