<div align="center">

# SEEYOU

**Real-time global intelligence platform running in the browser.**

Track aircraft, satellites, earthquakes, wildfires, cyber threats, naval vessels, military bases, nuclear sites, space debris, and more — all rendered on a 3D globe with military-grade shaders.

20+ live data layers. 25+ free APIs. Zero cost.

[Getting Started](#getting-started) · [Features](#features) · [Architecture](#architecture) · [Data Sources](#data-sources)

---

</div>

<br>

## What is SeeYou?

SeeYou is a full-stack intelligence platform that aggregates real-time data from 25+ public APIs and renders everything on an interactive CesiumJS 3D globe. Every data point is real — live aircraft transponders, orbital mechanics calculations, seismic readings, satellite-detected fires, geopolitical events, and more.

The entire stack runs locally with no paid services.

<br>

## Features

### Surveillance Layers

| Layer | Description | Source |
|-------|-------------|--------|
| **Aircraft** | 30,000+ live flights — position, callsign, altitude, heading, vertical speed | adsb.lol ADS-B |
| **Satellites** | 10,000 orbital objects with SGP4-propagated positions and orbit paths | CelesTrak TLE |
| **Space Debris** | 63,000 tracked objects — debris, rocket bodies, analyst objects | CelesTrak / Space-Track |
| **CCTV Cameras** | 800+ live video feeds from 30+ cities across 6 continents | TfL, NYC DOT, Caltrans, and more |
| **Traffic** | Animated particle flow on real road networks | OpenStreetMap Overpass |
| **Weather Radar** | Global radar overlay with temporal animation | RainViewer |
| **Temperature** | Global temperature heatmap overlay | OpenWeatherMap |
| **Air Quality** | Global AQI heatmap overlay (US EPA scale) | WAQI / AQICN |
| **Wind** | 4,000-particle wind flow with IDW interpolation | Open-Meteo |
| **METAR** | Aviation weather stations with flight categories (VFR/MVFR/IFR/LIFR) | aviationweather.gov |
| **Natural Events** | Active wildfires, storms, volcanoes, floods | NASA EONET |

### Intelligence Layers

| Layer | Description | Source |
|-------|-------------|--------|
| **Earthquakes** | Live seismic activity with animated shockwaves from epicenters | USGS GeoJSON |
| **Wildfires** | Satellite-detected active fires with radiative power | NASA FIRMS |
| **Submarine Cables** | Global undersea cable network and landing points | TeleGeography |
| **Military Bases** | 2,000+ installations worldwide — air, naval, ground | Wikidata |
| **Nuclear Sites** | 440+ reactors and weapons facilities with status | IAEA |
| **Naval Vessels** | Sanctioned ships tracked via AIS with alert flags | AIS data |
| **Cyber Threats** | Animated attack arcs between source and target countries | ThreatFox, AbuseIPDB |
| **Geopolitical Events** | Global news and conflict events geolocated in real-time | GDELT |
| **Space Weather** | Aurora oval, Kp index, solar storm alerts | NOAA SWPC |
| **Convergence Alerts** | Multi-signal warnings when layers intersect geographically | Internal engine |

### Military Intelligence

- **IMM-EKF Prediction** — Interacting Multiple Model Extended Kalman Filter predicts military aircraft trajectories 5 minutes ahead using 4 motion models
- **Pattern Detection** — Automatic orbit, combat air patrol, holding pattern, and transit classification using circle fitting and bimodal heading analysis
- **Tactical Shaders** — GLSL post-processing: Night Vision (NVG), FLIR Thermal, CRT Display, Anime Cel-Shading
- **HUD Overlays** — Per-shader heads-up displays with targeting reticles, coordinate readouts, and status indicators

### Interface

- Retractable sidebar with per-layer filters and counters
- Universal search across all data domains (Cmd+K)
- SVG minimap with viewport rectangle
- UTC timeline with time navigation
- Click-to-inspect popups for every data layer
- Intelligence legend with active layer indicators
- Keyboard shortcuts for shaders, fullscreen, and navigation

<br>

## Tech Stack

```
Frontend        React 19 · TypeScript · Vite · TailwindCSS · CesiumJS (Resium) · GLSL Shaders · Web Workers
Backend         Rust · Axum · Tokio · 18 Workspace Crates · SGP4 · nalgebra
Infrastructure  Redis 7 · Docker Compose · WebSocket
```

<br>

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Rust | 1.75+ |
| Docker | 24+ |
| Cesium Ion Token | Free — [sign up here](https://ion.cesium.com/) |

### Setup

```bash
# Clone
git clone https://github.com/sanztheo/SeeYou.git
cd SeeYou

# Configure environment
cp .env.example .env
# Edit .env — add your Cesium Ion token

# Start Redis
docker compose up -d

# Start the backend (port 3001)
cd backend
cargo run

# In another terminal — start the frontend (port 5173)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The globe loads immediately. Live data streams in within seconds.

### Verify

```bash
# Backend health check
curl http://localhost:3001/health
# → {"status":"ok","redis":"connected"}

# WebSocket — open browser DevTools → Network → WS tab
# You should see AircraftBatch messages every 2 seconds
```

<br>

## Architecture

SeeYou follows a **poll-cache-broadcast** architecture. The Rust backend continuously polls external APIs, caches results in Redis with TTL, and broadcasts updates to all connected clients via WebSocket. The React frontend renders everything on a CesiumJS 3D globe using GPU-batched Primitive Collections.

```
External APIs (25+)
    │
    │  HTTP polling (2s – 30min)
    ▼
┌─────────────────────────────────────────┐
│           Rust Backend (Axum)            │
│                                         │
│  18 crates · 8 background trackers      │
│  IMM-EKF prediction · SGP4 propagation  │
│  Redis cache (15s – 24h TTL)            │
│  REST API + WebSocket broadcast         │
└────────────────┬────────────────────────┘
                 │
                 │  WebSocket (chunked JSON)
                 │  REST (JSON)
                 ▼
┌─────────────────────────────────────────┐
│         React Frontend (Vite)           │
│                                         │
│  20+ CesiumJS Primitive layers          │
│  GLSL post-processing shaders           │
│  Zero external state libraries          │
│  BillboardCollection / PointPrimitive   │
│  ~20 GPU draw calls (down from 8000+)   │
└─────────────────────────────────────────┘
```

### Project Structure

```
SeeYou/
├── frontend/                   React + CesiumJS SPA
│   └── src/
│       ├── components/         33 domain component groups
│       ├── hooks/              State management (zero dependencies)
│       ├── services/           REST API clients
│       ├── shaders/            GLSL post-processing
│       ├── types/              TypeScript interfaces
│       └── workers/            Web Workers
├── backend/                    Rust workspace
│   └── crates/
│       ├── server/             Entry point — Axum, config, AppState
│       ├── api/                REST route handlers
│       ├── ws/                 WebSocket broadcast layer
│       ├── cache/              Redis caching with TTL
│       ├── services/           ADS-B + METAR trackers
│       ├── prediction/         IMM-EKF trajectory prediction
│       ├── cameras/            6-provider aggregation + health checks
│       ├── satellites/         CelesTrak TLE + SGP4
│       ├── events/             NASA EONET
│       ├── weather/            Open-Meteo grid
│       ├── traffic/            Overpass API road parser
│       ├── cables/             Submarine cable network
│       ├── seismic/            USGS earthquake data
│       ├── fires/              NASA FIRMS fire detection
│       ├── gdelt/              Geopolitical event stream
│       ├── maritime/           AIS vessel tracking
│       ├── cyber/              Cyber threat intelligence
│       └── space_weather/      NOAA space weather
├── docs/                       Documentation (Docsify)
└── docker-compose.yml          Redis infrastructure
```

### Performance

All visualization layers use imperative CesiumJS Primitive Collections instead of the Entity API. Every billboard, label, and point is batched into a single GPU draw call per collection.

| Metric | Value |
|--------|-------|
| GPU draw calls (all layers active) | ~20 |
| FPS with 20+ layers enabled | 50-60 |
| Aircraft update latency | ~2 seconds |
| Satellite propagation | SGP4 with WGS-84 |
| Prediction horizon | 300 seconds |
| Wind particle count | 4,000 |
| Max concurrent aircraft | 30,000+ |
| Max tracked orbital objects | 63,000+ |

<br>

## Data Sources

All data is fetched from free, public APIs. Optional API keys unlock extra layers (temperature, air quality).

| Source | Data | Polling |
|--------|------|---------|
| adsb.lol | Aircraft positions (ADS-B) | 2s |
| CelesTrak | Satellite TLE / space debris | 60s |
| USGS | Earthquake events | 5min |
| NASA FIRMS | Active wildfires | 30min |
| NASA EONET | Natural disasters | 30min |
| GDELT | Geopolitical events | 15min |
| NOAA SWPC | Space weather, aurora | 15min |
| TeleGeography | Submarine cables | 24h |
| ThreatFox / AbuseIPDB | Cyber threats | 15min |
| aviationweather.gov | METAR stations | 5min |
| Open-Meteo | Weather grid | 10min |
| RainViewer | Radar tiles | 5min |
| OpenWeatherMap | Temperature heatmap | On-demand |
| WAQI / AQICN | Air quality heatmap | On-demand |
| Overpass API | Road networks | On-demand |
| TfL / NYC DOT / Caltrans | CCTV camera feeds | 5min |
| Wikidata | Military bases | Static |
| IAEA | Nuclear sites | Static |

<br>

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Night Vision shader |
| `2` | FLIR Thermal shader |
| `3` | CRT Display shader |
| `4` | Anime shader |
| `5` | Reset to normal |
| `F` | Fullscreen |
| `B` | Toggle sidebar |
| `/` or `Cmd+K` | Search |

<br>

## Environment Variables

```bash
# Required
VITE_CESIUM_ION_TOKEN=       # Free from https://ion.cesium.com
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001
REDIS_URL=redis://127.0.0.1:6379

# Optional — weather heatmap layers
VITE_OPENWEATHER_API_KEY=    # Free from https://home.openweathermap.org/api_keys
VITE_WAQI_TOKEN=             # Free from https://aqicn.org/data-platform/token/

# Optional — backend tuning
SERVER_HOST=0.0.0.0
SERVER_PORT=3001
POLL_INTERVAL_SECS=2
SATELLITE_POLL_INTERVAL_SECS=60
CAMERA_POLL_INTERVAL_SECS=300
METAR_POLL_INTERVAL_SECS=300
WEATHER_POLL_INTERVAL_SECS=600
EVENTS_POLL_INTERVAL_SECS=1800
```

<br>

## License

Open source. See [LICENSE](LICENSE) for details.
