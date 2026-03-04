use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    redis: &'static str,
    postgres: &'static str,
}

/// GET /health -- lightweight probe that reports Redis connectivity.
pub async fn health_check(
    State(pool): State<RedisPool>,
    State(pg_pool): State<Option<db::PgPool>>,
) -> (StatusCode, Json<HealthResponse>) {
    let redis_status = match cache::ping_redis(&pool).await {
        Ok(()) => "connected",
        Err(_) => "disconnected",
    };

    let postgres_status = match pg_pool {
        Some(pool) => match db::ping_postgres(&pool).await {
            Ok(()) => "connected",
            Err(_) => "disconnected",
        },
        None => "disabled",
    };

    let response = HealthResponse {
        status: "ok",
        redis: redis_status,
        postgres: postgres_status,
    };

    (StatusCode::OK, Json(response))
}
