use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct AircraftPositionRow {
    pub observed_at: DateTime<Utc>,
    pub icao: String,
    pub callsign: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub altitude_m: f64,
    pub speed_ms: f64,
    pub heading_deg: f64,
    pub vertical_rate_ms: Option<f64>,
    pub on_ground: bool,
    pub is_military: bool,
}

#[derive(Debug, Clone)]
pub struct CameraRow {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub stream_type: String,
    pub source: String,
    pub is_online: bool,
    pub last_seen: DateTime<Utc>,
    pub city: Option<String>,
    pub country: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TrafficSegmentRow {
    pub observed_at: DateTime<Utc>,
    pub segment_id: String,
    pub road_name: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub speed_ratio: f64,
    pub delay_min: f64,
    pub severity: i16,
}

#[derive(Debug, Clone)]
pub struct WeatherReadingRow {
    pub observed_at: DateTime<Utc>,
    pub station_id: String,
    pub city: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub temp_c: Option<f64>,
    pub wind_kt: Option<f64>,
    pub visibility_m: Option<f64>,
    pub conditions: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EventRow {
    pub observed_at: DateTime<Utc>,
    pub event_id: String,
    pub event_type: String,
    pub lat: f64,
    pub lon: f64,
    pub severity: i16,
    pub description: String,
    pub source_url: Option<String>,
}
