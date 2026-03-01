use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum SatelliteCategory {
    Station,
    Starlink,
    Communication,
    Military,
    Weather,
    Navigation,
    Science,
    Other,
}

impl SatelliteCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Station => "station",
            Self::Starlink => "starlink",
            Self::Communication => "communication",
            Self::Military => "military",
            Self::Weather => "weather",
            Self::Navigation => "navigation",
            Self::Science => "science",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Satellite {
    pub norad_id: u64,
    pub name: String,
    pub category: SatelliteCategory,
    pub lat: f64,
    pub lon: f64,
    pub altitude_km: f64,
    pub velocity_km_s: f64,
    pub orbit_period_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TleData {
    pub norad_id: u64,
    pub name: String,
    pub line1: String,
    pub line2: String,
    pub category: SatelliteCategory,
}
