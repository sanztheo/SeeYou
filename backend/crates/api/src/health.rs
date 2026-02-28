use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    redis: &'static str,
}

/// GET /health -- lightweight probe that reports Redis connectivity.
pub async fn health_check(
    State(pool): State<RedisPool>,
) -> (StatusCode, Json<HealthResponse>) {
    let redis_status = match cache::ping_redis(&pool).await {
        Ok(()) => "connected",
        Err(_) => "disconnected",
    };

    let response = HealthResponse {
        status: "ok",
        redis: redis_status,
    };

    (StatusCode::OK, Json(response))
}
