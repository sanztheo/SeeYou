use axum::routing::get;
use axum::Router;

/// Build the REST API router.
/// The generic state bound lets the server crate provide its own `AppState`
/// as long as `RedisPool` can be extracted from it via `FromRef`.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    cache::RedisPool: axum::extract::FromRef<S>,
{
    Router::new()
        .route("/health", get(super::health::health_check))
        .route("/roads", get(super::roads::get_roads))
        .route("/cameras", get(super::cameras::list_cameras))
        .route("/cameras/proxy", get(super::cameras::proxy_camera))
}
