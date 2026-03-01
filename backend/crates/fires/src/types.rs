use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FireHotspot {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiresResponse {
    pub fires: Vec<FireHotspot>,
    pub fetched_at: String,
}
