use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use cache::RedisPool;
use serde::Deserialize;

use cameras::{Camera, CamerasResponse};

#[derive(Debug, Deserialize)]
pub struct CameraQuery {
    south: Option<f64>,
    west: Option<f64>,
    north: Option<f64>,
    east: Option<f64>,
    offset: Option<usize>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct ProxyQuery {
    url: String,
}

/// GET /cameras - list cameras with optional bbox filter and pagination.
pub async fn list_cameras(
    State(pool): State<RedisPool>,
    Query(q): Query<CameraQuery>,
) -> Result<Json<CamerasResponse>, (StatusCode, String)> {
    let cameras: Vec<Camera> = match cache::cameras::get_cameras(&pool).await {
        Ok(Some(cams)) => cams,
        Ok(None) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "cameras not yet available".into(),
            ));
        }
        Err(e) => {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
        }
    };

    let filtered: Vec<Camera> = match (q.south, q.west, q.north, q.east) {
        (Some(s), Some(w), Some(n), Some(e)) => cameras
            .into_iter()
            .filter(|c| c.lat >= s && c.lat <= n && c.lon >= w && c.lon <= e)
            .collect(),
        _ => cameras,
    };

    let total = filtered.len();
    let offset = q.offset.unwrap_or(0).min(total);
    let limit = q.limit.unwrap_or(total);
    let page = filtered.into_iter().skip(offset).take(limit).collect();

    Ok(Json(CamerasResponse {
        cameras: page,
        total,
    }))
}

/// GET /cameras/proxy?url=<encoded_url> - proxy a camera stream to avoid CORS.
pub async fn proxy_camera(
    State(client): State<reqwest::Client>,
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    cameras::proxy::proxy_camera_stream(&query.url, &client).await
}
