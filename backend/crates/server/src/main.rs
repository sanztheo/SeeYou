mod app_state;
mod config;
mod error;

use std::time::Duration;

use axum::{routing::get, Router};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

use app_state::AppState;
use config::Config;

const BROADCAST_CAPACITY: usize = 256;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // .env is optional -- CI and production supply vars directly.
    let _ = dotenvy::dotenv();

    fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;

    let redis_pool = cache::create_pool(&config.redis_url)?;
    info!(redis_url = %redact_url(&config.redis_url), "redis pool created");

    let ws_broadcast = ws::Broadcaster::new(BROADCAST_CAPACITY);

    let http_client = reqwest::Client::new();
    let poll_interval = Duration::from_secs(config.poll_interval_secs);

    tokio::spawn(services::aircraft_tracker::run_aircraft_tracker(
        http_client,
        redis_pool.clone(),
        ws_broadcast.clone(),
        poll_interval,
    ));

    let state = AppState {
        redis_pool,
        ws_broadcast,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(api::router())
        .route("/ws", get(ws::ws_handler))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(address = %addr, "server listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

/// Mask credentials in a URL so it is safe to log.
/// `redis://:secret@host:6379` → `redis://***@host:6379`
fn redact_url(raw: &str) -> String {
    match url::Url::parse(raw) {
        Ok(mut u) => {
            if !u.username().is_empty() || u.password().is_some() {
                let _ = u.set_username("***");
                let _ = u.set_password(None);
            }
            u.to_string()
        }
        Err(_) => "***".to_string(),
    }
}

/// Wait for Ctrl-C to enable graceful shutdown.
async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to listen for ctrl-c");
    info!("shutdown signal received");
}
