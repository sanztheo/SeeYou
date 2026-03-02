use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RoadType {
    Motorway,
    Trunk,
    Primary,
    Secondary,
    Tertiary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadNode {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Road {
    pub id: u64,
    pub road_type: RoadType,
    pub name: Option<String>,
    pub nodes: Vec<RoadNode>,
    pub speed_limit_kmh: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub south: f64,
    pub west: f64,
    pub north: f64,
    pub east: f64,
}
