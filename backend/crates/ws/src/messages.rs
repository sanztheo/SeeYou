use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AircraftPosition {
    pub icao: String,
    pub callsign: Option<String>,
    pub aircraft_type: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub altitude_m: f64,
    pub speed_ms: f64,
    pub heading: f64,
    pub vertical_rate_ms: f64,
    pub on_ground: bool,
    pub is_military: bool,
}

/// Wire format for all WebSocket messages.
/// The `tag` / `content` serde representation keeps the JSON shape
/// consistent: `{ "type": "Ping" }` or `{ "type": "Connected", "payload": { "client_id": "..." } }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsMessage {
    Connected { client_id: String },
    Ping,
    Pong,
    Error { message: String },
    AircraftUpdate { aircraft: Vec<AircraftPosition> },
    /// Chunked aircraft delivery — avoids multi-MB single frames.
    AircraftBatch {
        aircraft: Vec<AircraftPosition>,
        chunk_index: u32,
        total_chunks: u32,
    },
}
