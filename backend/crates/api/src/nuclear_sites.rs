use axum::{http::StatusCode, Json};
use serde_json::Value;

const NUCLEAR_SITES_JSON: &str = include_str!("../../../data/nuclear_sites.json");

pub async fn get_nuclear_sites() -> Result<Json<serde_json::Value>, StatusCode> {
    let mut payload: Value =
        serde_json::from_str(NUCLEAR_SITES_JSON).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(list) = payload.as_array_mut() {
        super::stable_ids::inject_stable_ids_in_array("nuclear_site", list);
    }

    Ok(Json(payload))
}
