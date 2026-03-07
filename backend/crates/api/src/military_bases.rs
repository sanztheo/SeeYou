use axum::{http::StatusCode, Json};
use serde_json::Value;

const MILITARY_BASES_JSON: &str = include_str!("../../../data/military_bases.json");

pub async fn get_military_bases() -> Result<Json<serde_json::Value>, StatusCode> {
    let mut payload: Value =
        serde_json::from_str(MILITARY_BASES_JSON).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(list) = payload.as_array_mut() {
        super::stable_ids::inject_stable_ids_in_array("military_base", list);
    }

    Ok(Json(payload))
}
