use axum::{http::StatusCode, Json};

const MILITARY_BASES_JSON: &str = include_str!("../../../data/military_bases.json");

pub async fn get_military_bases() -> Result<Json<serde_json::Value>, StatusCode> {
    serde_json::from_str(MILITARY_BASES_JSON)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
