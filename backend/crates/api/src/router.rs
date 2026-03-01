use axum::routing::get;
use axum::Router;

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
        .route("/geocode", get(super::geocode::geocode))
        .route("/events", get(super::events::get_events))
        .route("/weather", get(super::weather::get_weather))
        .route("/cables", get(super::cables::get_cables))
        .route("/seismic", get(super::seismic::get_seismic))
        .route("/fires", get(super::fires::get_fires))
        .route("/gdelt", get(super::gdelt::get_gdelt))
        .route("/maritime", get(super::maritime::get_maritime))
        .route("/cyber", get(super::cyber::get_cyber))
        .route("/space-weather", get(super::space_weather::get_space_weather))
        .route("/military-bases", get(super::military_bases::get_military_bases))
        .route("/nuclear-sites", get(super::nuclear_sites::get_nuclear_sites))
}
