use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use cache::RedisPool;
use serde::Deserialize;

use cameras::{Camera, CamerasResponse};

#[derive(Debug, Deserialize)]
pub struct BboxFilter {
    south: Option<f64>,
    west: Option<f64>,
    north: Option<f64>,
    east: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct ProxyQuery {
    url: String,
}

/// GET /cameras - list all cameras, optionally filtered by bounding box.
pub async fn list_cameras(
    State(pool): State<RedisPool>,
    Query(bbox): Query<BboxFilter>,
) -> Result<Json<CamerasResponse>, (StatusCode, String)> {
    let cameras: Vec<Camera> = cache::cameras::get_cameras(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .unwrap_or_default();

    let filtered: Vec<Camera> = match (bbox.south, bbox.west, bbox.north, bbox.east) {
        (Some(s), Some(w), Some(n), Some(e)) => cameras
            .into_iter()
            .filter(|c| c.lat >= s && c.lat <= n && c.lon >= w && c.lon <= e)
            .collect(),
        _ => cameras,
    };

    let total = filtered.len();
    Ok(Json(CamerasResponse {
        cameras: filtered,
        total,
    }))
}

/// GET /cameras/proxy?url=<encoded_url> - proxy a camera stream to avoid CORS.
pub async fn proxy_camera(
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let client = reqwest::Client::new();
    cameras::proxy::proxy_camera_stream(&query.url, &client).await
}
