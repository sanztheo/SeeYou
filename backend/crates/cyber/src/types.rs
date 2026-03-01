use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CyberThreat {
    pub id: String,
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
    pub confidence: u8,
    pub first_seen: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CyberResponse {
    pub threats: Vec<CyberThreat>,
    pub fetched_at: String,
}
