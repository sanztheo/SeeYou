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
            Self::Station => "Station",
            Self::Starlink => "Starlink",
            Self::Communication => "Communication",
            Self::Military => "Military",
            Self::Weather => "Weather",
            Self::Navigation => "Navigation",
            Self::Science => "Science",
            Self::Other => "Other",
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
