use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;
use serde_json::Value;

pub async fn get_fires(
    State(pool): State<RedisPool>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match cache::fires::get_fires::<fires::FiresResponse>(&pool).await {
        Ok(Some(data)) => {
            let mut payload =
                serde_json::to_value(data).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            if let Some(fires) = payload.get_mut("fires").and_then(Value::as_array_mut) {
                super::stable_ids::inject_stable_ids_in_array("fire_hotspot", fires);
            }

            Ok(Json(payload))
        }
        Ok(None) => Err(StatusCode::SERVICE_UNAVAILABLE),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
