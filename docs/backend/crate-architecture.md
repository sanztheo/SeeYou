# Backend Crate Architecture

The SeeYou backend is a Rust workspace with **11 crates**, each owning a specific domain. The binary entry point is the `server` crate, which boots the Axum HTTP server, initializes shared state, and spawns background data trackers.

## Workspace Layout

```toml
[workspace]
members = [
    "crates/server",      # Binary — entry point
    "crates/api",         # REST route handlers
    "crates/ws",          # WebSocket broadcast layer
    "crates/cache",       # Redis caching
    "crates/services",    # ADS-B + METAR business logic
    "crates/prediction",  # IMM-EKF prediction engine
    "crates/traffic",     # Overpass road parser
    "crates/cameras",     # Camera provider aggregation
    "crates/satellites",  # CelesTrak + SGP4
    "crates/events",      # NASA EONET
    "crates/weather",     # Open-Meteo
]
```

## Key Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `axum` | 0.7 | HTTP framework with WebSocket support |
| `tokio` | 1.x | Async runtime |
| `tower-http` | 0.6 | CORS and tracing middleware |
| `deadpool-redis` | 0.18 | Redis connection pool |
| `redis` | 0.27 | Redis client |
| `reqwest` | 0.12 | HTTP client for external APIs |
| `serde` / `serde_json` | 1.x | Serialization |
| `sgp4` | 2.x | Satellite orbit propagation |
| `nalgebra` | 0.33 | Linear algebra for EKF |
| `tracing` | 0.1 | Structured logging |
| `thiserror` | 2.x | Error type derivation |
| `chrono` | 0.4 | Date/time handling |

## Server Crate — Entry Point

### Startup Sequence

```rust
#[tokio::main]
async fn main() {
    // 1. Initialize structured logging
    tracing_subscriber::init();

    // 2. Load configuration from environment
    let config = Config::from_env();

    // 3. Create Redis connection pool
    let redis_pool = cache::create_pool(&config.redis_url);

    // 4. Create WebSocket broadcast channel (capacity: 256)
    let ws_broadcast = Broadcaster::new(256);

    // 5. Build shared AppState
    let state = AppState { redis_pool, ws_broadcast };

    // 6. Spawn 6 background data trackers
    tokio::spawn(aircraft_tracker::run(...));
    tokio::spawn(camera_tracker::run(...));
    tokio::spawn(satellite_tracker::run(...));
    tokio::spawn(metar_tracker::run(...));
    // + inline weather and events loops

    // 7. Build Axum router with CORS + tracing
    let app = Router::new()
        .merge(api::router())
        .route("/ws", get(ws::ws_handler))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // 8. Bind and serve
    axum::serve(listener, app).await;
}
```

### AppState

Shared state is minimal — just two resources:

```rust
#[derive(Clone)]
pub struct AppState {
    pub redis_pool: RedisPool,       // deadpool_redis connection pool
    pub ws_broadcast: Broadcaster,   // tokio::broadcast<WsMessage>
}
```

Both fields implement `FromRef<AppState>`, allowing Axum handlers to extract them directly:

```rust
async fn my_handler(
    State(pool): State<RedisPool>,
    State(broadcast): State<Broadcaster>,
) -> impl IntoResponse { ... }
```

### Error Handling

```rust
pub enum AppError {
    Internal(anyhow::Error),  // → 500 Internal Server Error
    NotFound,                  // → 404 Not Found
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Internal(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            Self::NotFound => (StatusCode::NOT_FOUND, "Not found"),
        }.into_response()
    }
}
```

### Configuration

All configuration is read from environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_HOST` | `0.0.0.0` | Bind address |
| `SERVER_PORT` | `3001` | HTTP port |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection |
| `POLL_INTERVAL_SECS` | `2` | Aircraft polling |
| `CAMERA_POLL_INTERVAL_SECS` | `300` | Camera health check |
| `SATELLITE_POLL_INTERVAL_SECS` | `60` | Satellite refresh |
| `METAR_POLL_INTERVAL_SECS` | `300` | METAR polling |
| `WEATHER_POLL_INTERVAL_SECS` | `600` | Weather grid refresh |
| `EVENTS_POLL_INTERVAL_SECS` | `1800` | Events refresh |

## API Crate — REST Handlers

See [REST API Reference](api-reference.md) for the full endpoint documentation.

The API crate defines the router and all REST handlers:

```rust
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::health_check))
        .route("/roads", get(roads::get_roads))
        .route("/cameras", get(cameras::list_cameras))
        .route("/cameras/proxy", get(cameras::proxy_camera))
        .route("/geocode", get(geocode::geocode))
        .route("/events", get(events::get_events))
        .route("/weather", get(weather::get_weather))
}
```

All handlers follow the same pattern:
1. Extract query parameters via `Query<T>`
2. Validate inputs (bounds, ranges, required fields)
3. Read from Redis cache via the `cache` crate
4. Return typed JSON response or status code error

## WS Crate — WebSocket Layer

See [WebSocket Protocol](websocket-protocol.md) for the full protocol documentation.

### Broadcaster

Wraps `tokio::sync::broadcast::Sender<WsMessage>`:

```rust
pub struct Broadcaster {
    sender: broadcast::Sender<WsMessage>,
}

impl Broadcaster {
    pub fn new(capacity: usize) -> Self;
    pub fn send(&self, msg: WsMessage) -> usize;  // returns receiver count
    pub fn subscribe(&self) -> broadcast::Receiver<WsMessage>;
}
```

### Connection Handler

Each WebSocket connection:
1. Gets a unique UUID `client_id`
2. Receives a `Connected { client_id }` greeting
3. Enters a `tokio::select!` loop:
   - **Inbound**: Parse frames, handle `Ping` → `Pong`, route valid messages
   - **Broadcast relay**: Forward messages from the broadcast channel
4. Cleans up on disconnect

## Patterns & Conventions

### Tracker Pattern

Every background tracker follows this loop:

```rust
pub async fn run(pool: RedisPool, broadcast: Broadcaster, interval: Duration) {
    loop {
        match fetch_data().await {
            Ok(data) => {
                cache::set_data(&pool, &data).await.ok();
                broadcast.send(WsMessage::DataBatch { ... });
            }
            Err(e) => tracing::error!("fetch failed: {}", e),
        }
        tokio::time::sleep(interval).await;
    }
}
```

### Chunked Broadcasting

Large datasets are split before broadcasting to avoid oversized WebSocket frames:

```rust
for (i, chunk) in data.chunks(2000).enumerate() {
    broadcast.send(WsMessage::DataBatch {
        items: chunk.to_vec(),
        chunk_index: i as u32,
        total_chunks: total as u32,
    });
}
```

### Generic Cache Functions

All cache modules use generics to avoid coupling:

```rust
pub async fn set<T: Serialize>(pool: &RedisPool, key: &str, data: &T, ttl: u64) -> Result<()>;
pub async fn get<T: DeserializeOwned>(pool: &RedisPool, key: &str) -> Result<Option<T>>;
```
