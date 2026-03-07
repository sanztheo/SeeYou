use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;
use serde_json::Value;

pub async fn get_gdelt(
    State(pool): State<RedisPool>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match cache::gdelt::get_gdelt::<gdelt::GdeltResponse>(&pool).await {
        Ok(Some(data)) => {
            let mut payload =
                serde_json::to_value(data).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            if let Some(events) = payload.get_mut("events").and_then(Value::as_array_mut) {
                super::stable_ids::inject_stable_ids_in_array("gdelt_event", events);
            }

            Ok(Json(payload))
        }
        Ok(None) => Err(StatusCode::SERVICE_UNAVAILABLE),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
