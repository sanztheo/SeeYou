use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;

pub async fn get_cyber(
    State(pool): State<RedisPool>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match cache::cyber::get_cyber::<cyber::CyberResponse>(&pool).await {
        Ok(Some(data)) => serde_json::to_value(data)
            .map(Json)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR),
        Ok(None) => Err(StatusCode::SERVICE_UNAVAILABLE),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
