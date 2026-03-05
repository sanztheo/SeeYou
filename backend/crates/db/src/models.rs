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

#[derive(Debug, Clone)]
pub struct SatellitePositionRow {
    pub observed_at: DateTime<Utc>,
    pub norad_id: i64,
    pub name: String,
    pub category: String,
    pub lat: f64,
    pub lon: f64,
    pub altitude_km: f64,
    pub velocity_km_s: f64,
}

#[derive(Debug, Clone)]
pub struct SeismicEventRow {
    pub observed_at: DateTime<Utc>,
    pub earthquake_id: String,
    pub title: String,
    pub magnitude: f64,
    pub lat: f64,
    pub lon: f64,
    pub depth_km: f64,
    pub event_time: Option<DateTime<Utc>>,
    pub url: Option<String>,
    pub felt: Option<i32>,
    pub tsunami: bool,
}

#[derive(Debug, Clone)]
pub struct FireHotspotRow {
    pub observed_at: DateTime<Utc>,
    pub fire_key: String,
    pub lat: f64,
    pub lon: f64,
    pub brightness: f64,
    pub confidence: String,
    pub frp: f64,
    pub daynight: String,
    pub acq_date: String,
    pub acq_time: String,
    pub satellite: String,
}

#[derive(Debug, Clone)]
pub struct GdeltEventRow {
    pub observed_at: DateTime<Utc>,
    pub event_key: String,
    pub url: String,
    pub title: String,
    pub lat: f64,
    pub lon: f64,
    pub tone: f64,
    pub domain: String,
    pub source_country: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MaritimeVesselRow {
    pub observed_at: DateTime<Utc>,
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

#[derive(Debug, Clone)]
pub struct CyberThreatRow {
    pub observed_at: DateTime<Utc>,
    pub threat_key: String,
    pub threat_id: Option<String>,
    pub threat_type: String,
    pub malware: Option<String>,
    pub src_ip: String,
    pub src_lat: f64,
    pub src_lon: f64,
    pub src_country: Option<String>,
    pub dst_ip: Option<String>,
    pub dst_lat: Option<f64>,
    pub dst_lon: Option<f64>,
    pub dst_country: Option<String>,
    pub confidence: i16,
    pub first_seen: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct SpaceWeatherSnapshotRow {
    pub observed_at: DateTime<Utc>,
    pub kp_index: f64,
}

#[derive(Debug, Clone)]
pub struct SpaceWeatherAuroraRow {
    pub observed_at: DateTime<Utc>,
    pub lat: f64,
    pub lon: f64,
    pub probability: i16,
}

#[derive(Debug, Clone)]
pub struct SpaceWeatherAlertRow {
    pub observed_at: DateTime<Utc>,
    pub product_id: String,
    pub issue_time: String,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct SubmarineCableRow {
    pub cable_id: String,
    pub name: String,
    pub length_km: Option<f64>,
    pub owners: Option<String>,
    pub year: Option<String>,
    pub coordinates_json: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CableLandingPointRow {
    pub landing_point_id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub country: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct MilitaryBaseRow {
    pub base_key: String,
    pub name: String,
    pub country: Option<String>,
    pub branch: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NuclearSiteRow {
    pub site_key: String,
    pub name: String,
    pub country: Option<String>,
    pub site_type: Option<String>,
    pub status: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub capacity_mw: Option<f64>,
    pub updated_at: DateTime<Utc>,
}
