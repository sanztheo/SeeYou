# SeeYou

**Real-Time 3D Surveillance Globe** — Track aircraft, satellites, cameras, weather, traffic, and natural events on an interactive CesiumJS globe with military-grade visual shaders.

---

## What is SeeYou?

SeeYou is a full-stack intelligence platform that aggregates live data from 12+ free public APIs and renders everything on a 3D globe in real time. Inspired by military surveillance systems and spy satellite interfaces, it provides a comprehensive situational awareness dashboard — at zero cost.

### Key Capabilities

| Domain | What You See | Data Source | Update Frequency |
|--------|-------------|-------------|-----------------|
| **Aircraft** | 30,000+ live flights with callsign, altitude, heading | ADS-B Exchange (adsb.lol) | Every 2 seconds |
| **Satellites** | 10,000 orbital objects with SGP4-propagated positions | CelesTrak TLE data | Every 60 seconds |
| **CCTV Cameras** | 5,000+ live feeds from 6 providers across 30+ cities | TfL, NYC DOT, Caltrans, and more | Every 5 minutes |
| **Weather** | Global radar overlay + 4,000-particle wind flow | RainViewer + Open-Meteo | 5-10 minutes |
| **Traffic** | OSM road network with animated particle flow | Overpass API | On-demand, cached 1 hour |
| **METAR** | Aviation weather stations with flight categories | aviationweather.gov | Every 5 minutes |
| **Events** | Active natural disasters (wildfires, storms, quakes) | NASA EONET v3 | Every 30 minutes |

### Military Intelligence Features

- **IMM-EKF Prediction Engine** — Interacting Multiple Model Extended Kalman Filter predicts military aircraft trajectories 5 minutes ahead using 4 motion models (constant velocity, acceleration, coordinated turn, climb/descend)
- **Pattern Detection** — Automatic classification of orbit patterns, combat air patrols, holding patterns, and transit routes using circle fitting (Kasa method) and bimodal heading analysis
- **Tactical Shaders** — GLSL post-processing effects: Night Vision (NVG), Forward-Looking Infrared (FLIR), CRT display, and Anime stylization

## Tech Stack

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  React 19 · TypeScript 5.9 · Vite 7 · Tailwind 4│
│  CesiumJS 1.138 · Resium 1.19 · HLS.js          │
├─────────────────────────────────────────────────┤
│                    Backend                       │
│  Rust · Axum 0.7 · Tokio · 11 Workspace Crates  │
│  SGP4 · nalgebra · deadpool-redis                │
├─────────────────────────────────────────────────┤
│                 Infrastructure                   │
│  Redis 7 (Alpine) · Docker Compose · WebSocket   │
└─────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/your-org/seeyou.git
cd seeyou
cp .env.example .env
# Edit .env with your Cesium Ion token

# 2. Start infrastructure
docker compose up -d

# 3. Start backend (port 3001)
cd backend && cargo run

# 4. Start frontend (port 5173)
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and explore the globe.

## Project Structure

```
seeyou/
├── frontend/               # React + CesiumJS SPA
│   └── src/
│       ├── components/     # 15 domain component groups
│       ├── hooks/          # State management (zero external libs)
│       ├── services/       # REST API clients
│       ├── shaders/        # GLSL post-processing effects
│       ├── types/          # TypeScript interfaces
│       └── workers/        # Web Workers for heavy computation
├── backend/                # Rust workspace
│   └── crates/
│       ├── server/         # Entry point, config, AppState
│       ├── api/            # REST handlers and routing
│       ├── ws/             # WebSocket broadcast layer
│       ├── cache/          # Redis caching with TTL
│       ├── services/       # ADS-B + METAR trackers
│       ├── prediction/     # IMM-EKF military trajectory prediction
│       ├── cameras/        # 6-provider camera aggregation
│       ├── satellites/     # CelesTrak + SGP4 propagation
│       ├── events/         # NASA EONET integration
│       ├── weather/        # Open-Meteo weather grid
│       └── traffic/        # Overpass API road parser
├── docs/                   # This documentation
└── docker-compose.yml      # Redis infrastructure
```
