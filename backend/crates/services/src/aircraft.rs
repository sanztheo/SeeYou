use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AircraftSource {
    AdsbLol,
    OpenSky,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aircraft {
    pub icao: String,
    pub callsign: Option<String>,
    pub registration: Option<String>,
    pub aircraft_type: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub altitude_m: f64,
    pub speed_ms: f64,
    pub heading: f64,
    pub vertical_rate_ms: f64,
    pub on_ground: bool,
    pub is_military: bool,
    pub squawk: Option<String>,
    pub last_seen: f64,
    pub source: AircraftSource,
}
