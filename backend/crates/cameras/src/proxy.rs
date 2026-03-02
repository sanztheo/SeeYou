use std::time::Duration;

use anyhow::Context;
use axum::body::Body;
use axum::http::{header, Response, StatusCode};

const PROXY_TIMEOUT: Duration = Duration::from_secs(10);

/// Fetch a camera image/stream and return it as an Axum response with CORS headers.
pub async fn proxy_camera_stream(
    camera_url: &str,
    client: &reqwest::Client,
) -> Result<Response<Body>, (StatusCode, String)> {
    let upstream = client
        .get(camera_url)
        .timeout(PROXY_TIMEOUT)
        .header("User-Agent", "Mozilla/5.0 (compatible; SeeYou/1.0)")
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("upstream request failed: {e}")))?
        .error_for_status()
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("upstream error: {e}")))?;

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
