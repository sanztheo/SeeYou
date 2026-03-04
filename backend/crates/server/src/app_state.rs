use cache::RedisPool;
use ws::Broadcaster;

#[derive(Clone)]
pub struct AppState {
    pub redis_pool: RedisPool,
    pub pg_pool: Option<db::PgPool>,
    pub ws_broadcast: Broadcaster,
    pub http_client: reqwest::Client,
}

// Allow axum extractors to pull `RedisPool` out of `AppState`.
impl axum::extract::FromRef<AppState> for RedisPool {
    fn from_ref(state: &AppState) -> Self {
        state.redis_pool.clone()
    }
}

// Allow axum extractors to pull `Broadcaster` out of `AppState`.
impl axum::extract::FromRef<AppState> for Broadcaster {
    fn from_ref(state: &AppState) -> Self {
        state.ws_broadcast.clone()
    }
}

// Allow axum extractors to pull optional `PgPool` out of `AppState`.
impl axum::extract::FromRef<AppState> for Option<db::PgPool> {
    fn from_ref(state: &AppState) -> Self {
        state.pg_pool.clone()
    }
}

// Allow axum extractors to pull `reqwest::Client` out of `AppState`.
impl axum::extract::FromRef<AppState> for reqwest::Client {
    fn from_ref(state: &AppState) -> Self {
        state.http_client.clone()
    }
}
