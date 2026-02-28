use cache::RedisPool;
use ws::Broadcaster;

#[derive(Clone)]
pub struct AppState {
    pub redis_pool: RedisPool,
    pub ws_broadcast: Broadcaster,
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
