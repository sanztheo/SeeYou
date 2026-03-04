use axum::routing::{get, post};
use axum::Router;

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    cache::RedisPool: axum::extract::FromRef<S>,
    Option<db::PgPool>: axum::extract::FromRef<S>,
    reqwest::Client: axum::extract::FromRef<S>,
{
    Router::new()
        .route("/health", get(super::health::health_check))
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
        .route(
            "/space-weather",
            get(super::space_weather::get_space_weather),
        )
        .route(
            "/military-bases",
            get(super::military_bases::get_military_bases),
        )
        .route(
            "/nuclear-sites",
            get(super::nuclear_sites::get_nuclear_sites),
        )
        .route("/traffic/tiles-url", get(super::tomtom::get_tiles_url))
        .route("/traffic/flow", get(super::tomtom::get_flow))
        .route("/traffic/incidents", get(super::tomtom::get_incidents))
        .route("/traffic/route", post(super::tomtom::post_route))
}
