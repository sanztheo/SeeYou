use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{Duration, Instant},
};

use anyhow::Context;
use axum::body::Body;
use axum::http::{header, Response, StatusCode};
use tokio::sync::RwLock;

const PROXY_TIMEOUT: Duration = Duration::from_secs(10);
const DEAD_STREAM_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
static DEAD_STREAM_CACHE: OnceLock<RwLock<HashMap<String, Instant>>> = OnceLock::new();

fn dead_stream_cache() -> &'static RwLock<HashMap<String, Instant>> {
    DEAD_STREAM_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

async fn is_cached_dead_stream(camera_url: &str) -> bool {
    let now = Instant::now();
    let mut cache = dead_stream_cache().write().await;

    match cache.get(camera_url).copied() {
        Some(expires_at) if expires_at > now => true,
        Some(_) => {
            cache.remove(camera_url);
            false
        }
        None => false,
    }
}

async fn mark_dead_stream(camera_url: &str) {
    let mut cache = dead_stream_cache().write().await;
    cache.insert(
        camera_url.to_string(),
        Instant::now() + DEAD_STREAM_CACHE_TTL,
    );
}

/// Lightweight HEAD probe — checks if an upstream stream is reachable without
/// downloading the body. Returns 200 if alive, 404/502 if dead.
pub async fn probe_camera_stream(
    camera_url: &str,
    client: &reqwest::Client,
) -> Result<StatusCode, (StatusCode, String)> {
    if is_cached_dead_stream(camera_url).await {
        return Err((
            StatusCode::NOT_FOUND,
            "upstream camera stream unavailable (cached)".into(),
        ));
    }

    let resp = match client
        .head(camera_url)
        .timeout(Duration::from_secs(5))
        .header("User-Agent", "Mozilla/5.0 (compatible; SeeYou/1.0)")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            mark_dead_stream(camera_url).await;
            return Err((
                StatusCode::BAD_GATEWAY,
                format!("upstream probe failed: {e}"),
            ));
        }
    };

    if resp.status().is_success() || resp.status().as_u16() == 206 {
        return Ok(StatusCode::OK);
    }

    mark_dead_stream(camera_url).await;
    Err((
        StatusCode::NOT_FOUND,
        format!("upstream stream unavailable: {}", resp.status()),
    ))
}

/// Fetch a camera image/stream and return it as an Axum response with CORS headers.
pub async fn proxy_camera_stream(
    camera_url: &str,
    client: &reqwest::Client,
) -> Result<Response<Body>, (StatusCode, String)> {
    if is_cached_dead_stream(camera_url).await {
        return Err((
            StatusCode::NOT_FOUND,
            "upstream camera stream unavailable (cached)".into(),
        ));
    }

    let upstream = match client
        .get(camera_url)
        .timeout(PROXY_TIMEOUT)
        .header("User-Agent", "Mozilla/5.0 (compatible; SeeYou/1.0)")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            // Cache timeout/connection failures so we don't retry for 10 min
            mark_dead_stream(camera_url).await;
            return Err((
                StatusCode::BAD_GATEWAY,
                format!("upstream request failed: {e}"),
            ));
        }
    };

    if !upstream.status().is_success() {
        let status = upstream.status();
        if status == StatusCode::NOT_FOUND || status == StatusCode::GONE {
            mark_dead_stream(camera_url).await;
            return Err((
                StatusCode::NOT_FOUND,
                format!("upstream camera stream unavailable: {status}"),
            ));
        }

        return Err((StatusCode::BAD_GATEWAY, format!("upstream error: {status}")));
    }

    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = upstream
        .bytes()
        .await
        .context("failed to read upstream body")
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "public, max-age=5")
        .body(Body::from(bytes))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
