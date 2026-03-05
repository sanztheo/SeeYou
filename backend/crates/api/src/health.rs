use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;
use serde::Serialize;
use std::time::Duration;
use tokio::{task::spawn_blocking, time::timeout};

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    redis: &'static str,
    postgres: &'static str,
    redpanda: &'static str,
    surrealdb: &'static str,
}

/// GET /health -- lightweight probe that reports Redis connectivity.
pub async fn health_check(
    State(pool): State<RedisPool>,
    State(pg_pool): State<Option<db::PgPool>>,
    State(bus_producer): State<Option<bus::BusProducer>>,
    State(http_client): State<reqwest::Client>,
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

    let redpanda_status = match bus_producer {
        Some(producer) if producer.enabled() => {
            let handle = spawn_blocking(move || producer.broker_connected(Duration::from_secs(1)));
            match timeout(Duration::from_secs(2), handle).await {
                Ok(Ok(true)) => "connected",
                Ok(Ok(false)) | Ok(Err(_)) | Err(_) => "configured",
            }
        }
        Some(_) => "disabled",
        None => "disabled",
    };

    let surrealdb_status = match std::env::var("SURREALDB_URL") {
        Ok(url) => {
            let probe_url = normalize_surreal_probe_url(&url);
            match timeout(Duration::from_secs(2), http_client.get(probe_url).send()).await {
                Ok(Ok(response)) if response.status().is_success() => "connected",
                Ok(Ok(_)) | Ok(Err(_)) | Err(_) => "disconnected",
            }
        }
        Err(_) => "disabled",
    };

    let response = HealthResponse {
        status: "ok",
        redis: redis_status,
        postgres: postgres_status,
        redpanda: redpanda_status,
        surrealdb: surrealdb_status,
    };

    (StatusCode::OK, Json(response))
}

fn normalize_surreal_probe_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "http://127.0.0.1:8000".to_string();
    }

    let normalized_scheme = if let Some(rest) = trimmed.strip_prefix("ws://") {
        format!("http://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("wss://") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    };

    let without_trailing_slash = normalized_scheme.trim_end_matches('/').to_string();
    if without_trailing_slash.ends_with("/rpc") {
        without_trailing_slash
            .trim_end_matches("/rpc")
            .trim_end_matches('/')
            .to_string()
    } else {
        normalized_scheme
    }
}
