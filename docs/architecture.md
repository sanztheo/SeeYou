# System Architecture

SeeYou follows a **poll-cache-broadcast** architecture. The Rust backend continuously polls external data sources, caches results in Redis, and broadcasts updates to all connected clients via WebSocket. The React frontend renders everything on a CesiumJS 3D globe.

## High-Level Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      External Data Sources                       │
│  adsb.lol  CelesTrak  EONET  Open-Meteo  aviationweather.gov   │
│  TfL  NYC DOT  Caltrans  Overpass  Nominatim  RainViewer       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP polling (2s – 30min intervals)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Rust Backend (Axum)                          │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐│
│  │  Trackers    │  │  REST API   │  │   WebSocket Broadcast    ││
│  │  (6 loops)   │  │  (7 routes) │  │   (tokio::broadcast)     ││
│  └──────┬───────┘  └──────┬──────┘  └────────────┬─────────────┘│
│         │                 │                       │              │
│         ▼                 ▼                       │              │
│  ┌─────────────────────────────┐                  │              │
│  │    Redis Cache (TTL-based)  │──────────────────┘              │
│  │    15s – 24h per domain     │                                 │
│  └─────────────────────────────┘                                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  IMM-EKF Prediction Engine (military aircraft only)          ││
│  │  4 motion models · pattern detection · 300s horizon          ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬───────────────────────────────────┘
                               │ WebSocket (chunked JSON frames)
                               │ REST (JSON responses)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                        │
│                                                                  │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────────────┐│
│  │ useWebSocket │  │ REST       │  │  useAppState             ││
│  │ (auto-       │  │ Services   │  │  (central orchestrator)  ││
│  │  reconnect)  │  │ (chunked)  │  │                          ││
│  └──────┬───────┘  └─────┬──────┘  └───────────┬──────────────┘│
│         │                │                      │               │
│         └────────────────┴──────────────────────┘               │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    CesiumJS 3D Globe                         ││
│  │  Aircraft · Satellites · Cameras · Weather · Traffic         ││
│  │  METAR · Events · Cities · Shaders · HUD overlays           ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

## Backend Architecture

The backend is a Rust workspace with **11 crates**, each owning a specific domain:

```
backend/crates/
├── server/       Main binary — boots Axum, spawns trackers
├── api/          REST route handlers
├── ws/           WebSocket upgrade + broadcast channel
├── cache/        Redis pool + per-domain get/set with TTL
├── services/     ADS-B fetcher + METAR tracker + aircraft tracker loop
├── prediction/   IMM-EKF engine + pattern detection
├── cameras/      6-provider camera aggregation + health checks
├── satellites/   CelesTrak TLE fetch + SGP4 propagation
├── events/       NASA EONET parser
├── weather/      Open-Meteo grid fetcher
└── traffic/      Overpass QL query builder + road parser
```

### Crate Dependency Graph

```
server (binary)
  ├── api ──────────► cache
  ├── ws ───────────► prediction
  ├── services ─────► cache, ws, prediction
  ├── cameras ──────► cache
  ├── satellites ───► cache, ws
  ├── events
  ├── weather
  └── traffic

cache ──► deadpool-redis, redis
prediction ──► nalgebra
satellites ──► sgp4
```

### Shared State (AppState)

All handlers and trackers share state through Axum's `FromRef` extractor pattern:

```rust
#[derive(Clone)]
pub struct AppState {
    pub redis_pool: RedisPool,      // deadpool_redis connection pool
    pub ws_broadcast: Broadcaster,  // tokio::broadcast<WsMessage>
}
```

Axum handlers extract either `RedisPool` or `Broadcaster` directly — no need to unwrap the full state.

### Background Tracker Architecture

Each data domain runs an independent polling loop via `tokio::spawn`:

| Tracker | Crate | Interval | Pipeline |
|---------|-------|----------|----------|
| Aircraft | `services` | 2s | Poll adsb.lol → deduplicate → cache → predict → broadcast chunks |
| Satellite | `satellites` | 60s | Fetch TLE → SGP4 propagate → cache → broadcast chunks |
| Camera | `cameras` | 300s | Poll 6 providers → health check → cache |
| METAR | `services` | 300s | Poll aviationweather.gov → cache → broadcast |
| Weather | `weather` | 600s | Poll Open-Meteo → cache |
| Events | `events` | 1800s | Poll NASA EONET → cache |

All trackers follow the same pattern:
1. **Fetch** from external API(s) — often concurrent via `tokio::spawn`
2. **Transform** raw data into domain types
3. **Cache** to Redis with TTL via the `cache` crate
4. **Broadcast** via WebSocket (for real-time domains)

## Frontend Architecture

The frontend is a single-page application with **zero external state libraries** — all state is managed through custom React hooks.

### Component Hierarchy

```
App.tsx
├── useAppState()           Central state orchestrator (455 lines)
│   ├── useWebSocket()      Auto-reconnecting WS client
│   ├── useAircraftStore()  Map<icao, AircraftPosition>
│   └── useSatelliteStore() Map<norad_id, SatellitePosition>
│
├── Globe.tsx               Resium <Viewer> wrapper
│   ├── AircraftLayer       Billboards + interactions + route overlay
│   ├── SatelliteLayer      Orbital positions + orbit polylines
│   ├── TrafficLayer        Road polylines + particle animation engine
│   ├── CameraLayer         Camera icons (online/offline)
│   ├── WeatherLayer        RainViewer radar tile animation
│   ├── WindParticleLayer   Canvas-based wind flow (4000 particles)
│   ├── MetarLayer          Aviation weather station icons
│   ├── EventLayer          Natural disaster icons
│   ├── CityLabelsLayer     120+ world capital labels
│   └── ShaderManager       GLSL post-processing (NVG/FLIR/CRT/Anime)
│
├── Sidebar.tsx             Filters and controls for all domains
├── SearchBar.tsx           Unified search (aircraft, satellites, cameras, cities)
├── Timeline.tsx            UTC clock + time navigation
├── Minimap.tsx             SVG world overview with viewport rect
├── AlertSystem.tsx         Auto-dismissing toasts
├── HUD overlays            NvgHud, FlirHud, CrtHud, CursorCoords, CameraInfo
└── Popups                  AircraftPopup, SatellitePopup, EventPopup, MetarPopup
```

### Rendering Strategy

All visualization layers use **imperative Cesium APIs** (not JSX-based Resium components) for performance:

- Layers return `null` from React render
- Entity management happens in `useEffect` hooks via `CustomDataSource`
- Batch operations wrapped in `suspendEvents()` / `resumeEvents()`
- Incremental entity diffing (add/update/remove) avoids full recreation
- `requestAnimationFrame` chunking for large batch additions (500 entities per frame)
- Viewport culling via `computeViewRectangle()` + `Rectangle.contains()`

### Level of Detail (LOD)

Camera altitude drives what is visible:

| Altitude | Labels | Max Entities | Point Size |
|----------|--------|-------------|------------|
| < 50 km | Full detail | Unlimited | Large |
| 50-200 km | Callsigns | 5000 | Medium |
| 200-1000 km | None | 2000 | Small |
| > 1000 km | None | 1000 | Minimum |

## Communication Protocols

### WebSocket (Real-Time)

- **Transport**: Native WebSocket on `/ws`
- **Format**: Tagged JSON (`{ "type": "...", "payload": {...} }`)
- **Chunking**: Large datasets split into 2,000-item chunks with `chunk_index` / `total_chunks`
- **Heartbeat**: Server sends `Ping`, client responds `Pong`
- **Reconnection**: Exponential backoff — `2000ms × 1.5^attempt`, max 10 attempts

### REST API (On-Demand)

- **Transport**: HTTP/1.1 with CORS enabled
- **Format**: JSON responses
- **Pagination**: `offset` + `limit` params on `/cameras` and `/roads`
- **Caching**: Redis-backed with domain-specific TTLs (15s to 24h)

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Aircraft update latency | ~2 seconds (poll interval) |
| WebSocket frame size | ~200 KB per 2,000-aircraft chunk |
| Satellite propagation | SGP4 with WGS-84 geodetic conversion |
| Prediction horizon | 300 seconds, 5-second steps |
| Redis memory footprint | ~50 MB (all domains cached) |
| Frontend entity ceiling | 30,000 aircraft + 10,000 satellites |
| Camera proxy timeout | 10 seconds |
| Wind particle count | 4,000 (IDW-interpolated) |
