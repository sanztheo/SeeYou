use axum::{http::StatusCode, Json};

const NUCLEAR_SITES_JSON: &str = include_str!("../../../data/nuclear_sites.json");

pub async fn get_nuclear_sites() -> Result<Json<serde_json::Value>, StatusCode> {
    serde_json::from_str(NUCLEAR_SITES_JSON)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
