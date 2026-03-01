# Getting Started

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Frontend build and dev server |
| **npm** | 10+ | Package management |
| **Rust** | 1.75+ | Backend compilation |
| **Docker** | 24+ | Redis container |
| **Cesium Ion Token** | — | [Sign up free](https://ion.cesium.com/) for 3D tiles and imagery |

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/seeyou.git
cd seeyou
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Backend
SERVER_HOST=0.0.0.0
SERVER_PORT=3001
REDIS_URL=redis://127.0.0.1:6379

# Frontend
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token_here
```

### 3. Start Redis

```bash
docker compose up -d
```

This starts Redis 7 (Alpine) on port 6379 with a persistent volume and automatic health checks.

### 4. Start the Backend

```bash
cd backend
cargo run
```

On first run, Cargo downloads and compiles all 11 workspace crates. Subsequent starts are fast. The server binds to `0.0.0.0:3001` and spawns 6 background data trackers.

You should see:

```
INFO  server: Starting SeeYou backend on 0.0.0.0:3001
INFO  server: Aircraft tracker started (poll: 2s)
INFO  server: Satellite tracker started (poll: 60s)
INFO  server: Camera tracker started (poll: 300s)
INFO  server: METAR tracker started (poll: 300s)
INFO  server: Weather tracker started (poll: 600s)
INFO  server: Events tracker started (poll: 1800s)
```

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The 3D globe loads immediately. Live data populates within 2-5 seconds as WebSocket messages arrive.

## Available Commands

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |

### Backend

| Command | Description |
|---------|-------------|
| `cargo run` | Start the server (debug mode) |
| `cargo build` | Compile without running |
| `cargo build --release` | Optimized production build |
| `cargo test` | Run all workspace tests |

### Infrastructure

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start Redis in background |
| `docker compose down` | Stop Redis |
| `docker compose logs redis` | View Redis logs |

## Environment Variables Reference

### Required

| Variable | Description |
|----------|-------------|
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion access token for 3D tiles and imagery |
| `REDIS_URL` | Redis connection string (default: `redis://127.0.0.1:6379`) |
| `VITE_WS_URL` | WebSocket URL the frontend connects to |
| `VITE_API_URL` | REST API base URL the frontend calls |

### Optional (Backend Tuning)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_HOST` | `0.0.0.0` | Backend bind address |
| `SERVER_PORT` | `3001` | Backend HTTP port |
| `POLL_INTERVAL_SECS` | `2` | Aircraft polling frequency |
| `CAMERA_POLL_INTERVAL_SECS` | `300` | Camera health check interval |
| `SATELLITE_POLL_INTERVAL_SECS` | `60` | Satellite TLE refresh interval |
| `METAR_POLL_INTERVAL_SECS` | `300` | Aviation weather polling |
| `WEATHER_POLL_INTERVAL_SECS` | `600` | Open-Meteo weather grid refresh |
| `EVENTS_POLL_INTERVAL_SECS` | `1800` | NASA EONET events refresh |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Toggle Night Vision shader |
| `2` | Toggle FLIR thermal shader |
| `3` | Toggle CRT display shader |
| `4` | Toggle Anime shader |
| `5` | Reset to default rendering |
| `F` | Toggle fullscreen |
| `B` | Toggle sidebar |
| `/` or `Cmd+K` | Open search bar |

## Verifying the Installation

1. **Backend health check**: `curl http://localhost:3001/health` should return `{"status":"ok","redis":"connected"}`
2. **WebSocket**: Open browser DevTools → Network → WS tab. You should see `AircraftBatch` messages arriving every 2 seconds
3. **Globe**: Aircraft icons should appear within 5 seconds of opening the app
