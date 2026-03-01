use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmarineCable {
    pub id: String,
    pub name: String,
    pub length_km: Option<f64>,
    pub owners: Option<String>,
    pub year: Option<String>,
    pub coordinates: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LandingPoint {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub country: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CablesResponse {
    pub cables: Vec<SubmarineCable>,
    pub landing_points: Vec<LandingPoint>,
    pub fetched_at: String,
}
