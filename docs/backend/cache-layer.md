# Redis Cache Layer

All external API data is cached in Redis with domain-specific TTLs. The cache layer provides a clean abstraction over `deadpool-redis` with generic serialization.

## Architecture

```
cache/
├── lib.rs          Module exports + CacheError enum
├── pool.rs         Redis connection pool creation
├── health.rs       Redis health check (PING)
├── aircraft.rs     aircraft:all (TTL: 15s)
├── cameras.rs      cameras:all (TTL: 300s)
├── events.rs       events:active (TTL: 1800s)
├── weather.rs      weather:grid (TTL: 600s)
├── roads.rs        roads:{bbox} (TTL: 3600s)
├── geocode.rs      geocode:{query} (TTL: 86400s)
├── satellites.rs   satellites:all (TTL: 60s)
└── metar.rs        metar:all (TTL: 300s)
```

## Connection Pool

Uses `deadpool_redis::Pool` for async connection management:

```rust
pub type RedisPool = deadpool_redis::Pool;

pub fn create_pool(redis_url: &str) -> RedisPool {
    let cfg = deadpool_redis::Config::from_url(redis_url);
    cfg.create_pool(Some(Runtime::Tokio1)).unwrap()
}
```

## Cache Pattern

All modules follow an identical get/set pattern with generic serialization:

```rust
pub async fn set_data<T: Serialize>(pool: &RedisPool, data: &T) -> Result<()> {
    let mut conn = pool.get().await?;
    let json = serde_json::to_string(data)?;
    redis::cmd("SET")
        .arg("domain:key")
        .arg(&json)
        .arg("EX")
        .arg(TTL_SECONDS)
        .query_async(&mut conn)
        .await?;
    Ok(())
}

pub async fn get_data<T: DeserializeOwned>(pool: &RedisPool) -> Result<Option<T>> {
    let mut conn = pool.get().await?;
    let result: Option<String> = redis::cmd("GET")
        .arg("domain:key")
        .query_async(&mut conn)
        .await?;
    Ok(result.map(|s| serde_json::from_str(&s)).transpose()?)
}
```

## Cache Keys & TTLs

| Domain | Redis Key | TTL | Size Estimate | Notes |
|--------|-----------|-----|--------------|-------|
| Aircraft | `aircraft:all` | 15s | ~5 MB | Full aircraft array, refreshed every 2s |
| Satellites | `satellites:all` | 60s | ~2 MB | All satellite positions |
| METAR | `metar:all` | 300s | ~500 KB | Global aviation weather |
| Cameras | `cameras:all` | 300s | ~1 MB | All cameras with online status |
| Weather | `weather:grid` | 600s | ~10 KB | 40 weather grid points |
| Events | `events:active` | 1800s | ~20 KB | Active natural events |
| Roads | `roads:{s:.2}:{w:.2}:{n:.2}:{e:.2}` | 3600s | ~100 KB-2 MB | Per-bbox road data |
| Geocode | `geocode:{normalized_query}` | 86400s | ~2 KB | Per-query geocode results |

### Key Formatting

- **Roads**: Bounding box coordinates formatted to 2 decimal places for consistent cache keys: `roads:48.80:2.20:48.90:2.40`
- **Geocode**: Query strings are lowercased, trimmed, and sanitized before hashing: `geocode:paris france`

## Error Handling

```rust
pub enum CacheError {
    PoolCreation(String),
    Connection(String),
    Command(String),
    UnexpectedResponse(String),
    Serialization(String),
}
```

Cache errors are non-fatal — trackers log the error and continue to the next poll cycle. REST handlers fall through to return a 500 status if the cache is unavailable.

## Health Check

The `/health` endpoint verifies Redis connectivity:

```rust
pub async fn check_health(pool: &RedisPool) -> bool {
    let mut conn = pool.get().await.ok()?;
    redis::cmd("PING").query_async::<String>(&mut conn).await.is_ok()
}
```

Returns `{"status": "ok", "redis": "connected"}` or `{"status": "ok", "redis": "disconnected"}`.

## Memory Footprint

Estimated total Redis memory usage: **~10-15 MB** with all domains cached. The largest consumer is `aircraft:all` at ~5 MB (30,000 aircraft × ~170 bytes each as JSON).

## Infrastructure

Redis runs as a Docker container:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
```

Persistent volume ensures cache survives container restarts (though all data has TTLs and will naturally expire).
