use serde::{Deserialize, Serialize};

/// A GDACS (Global Disaster Alert and Coordination System) alert. Only
/// covers `event_type` in `TC` (tropical cyclone), `FL` (flood), `VO`
/// (volcano) and `DR` (drought) — see `gdacs.rs` for why `EQ` (earthquake)
/// and `WF` (wildfire) are deliberately excluded.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisasterEvent {
    pub event_id: String,
    pub event_type: String,
    pub alert_level: String,
    pub alert_score: f64,
    pub title: String,
    pub url: String,
    pub country: Option<String>,
    pub iso3: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub from_date: String,
    pub to_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisastersResponse {
    pub disasters: Vec<DisasterEvent>,
    pub fetched_at: String,
}
