use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GdeltEvent {
    pub url: String,
    pub title: String,
    pub lat: f64,
    pub lon: f64,
    pub tone: f64,
    pub domain: String,
    pub source_country: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GdeltResponse {
    pub events: Vec<GdeltEvent>,
    pub fetched_at: String,
}
