# Frontend Application Structure

The frontend is a React 19 single-page application built with Vite 7, TypeScript 5.9, and CesiumJS 1.138 (via Resium 1.19). Styling uses Tailwind CSS v4 with a dark military/surveillance aesthetic.

## Technology Stack

| Technology | Version | Role |
|-----------|---------|------|
| React | 19.2 | UI framework |
| TypeScript | 5.9 | Type safety |
| Vite | 7.3 | Build tool and dev server |
| CesiumJS | 1.138 | 3D globe rendering engine |
| Resium | 1.19 | React bindings for CesiumJS |
| Tailwind CSS | 4.2 | Utility-first styling |
| HLS.js | 1.6 | HTTP Live Streaming for cameras |
| Vitest | 4.0 | Testing framework |

## Directory Map

```
frontend/src/
├── main.tsx                    Entry point — Cesium token init + React root
├── App.tsx                     Root — assembles Globe, Sidebar, HUD, Popups
├── index.css                   Tailwind v4 import + custom scrollbar
│
├── lib/
│   ├── cesium-config.ts        Cesium Ion token initialization
│   └── constants.ts            WS_URL, API_URL, reconnect config
│
├── types/                      All TypeScript interfaces
│   ├── aircraft.ts             AircraftPosition, FlightRoute, PredictedTrajectory
│   ├── satellite.ts            SatellitePosition, SatelliteCategory
│   ├── camera.ts               Camera, StreamType, CameraFilter
│   ├── traffic.ts              Road, RoadNode, RoadType, TrafficFilter
│   ├── weather.ts              WeatherPoint, WeatherGrid, RainViewerData
│   ├── metar.ts                MetarStation, FlightCategory
│   ├── events.ts               NaturalEvent, EventCategory
│   ├── ws.ts                   WsMessage union type, ConnectionStatus
│   └── env.d.ts                Vite ImportMetaEnv declaration
│
├── hooks/                      Custom state management hooks
│   ├── useAppState.ts          Central orchestrator (455 lines)
│   ├── useWebSocket.ts         Auto-reconnecting WebSocket client
│   ├── useAircraftStore.ts     Aircraft entity map with batch ingestion
│   ├── useSatelliteStore.ts    Satellite entity map with batch ingestion
│   ├── useClustering.ts        Grid-based entity clustering
│   ├── useLevelOfDetail.ts     Camera altitude → LOD configuration
│   ├── useKeyboardShortcuts.ts Keyboard bindings (1-5, F, B, /)
│   ├── useViewerCallbacks.ts   Cesium camera + cursor tracking
│   └── batchAccumulator.ts     Pure batch chunk logic (unit-testable)
│
├── services/                   REST API client modules
│   ├── cameraService.ts        GET /cameras with chunked pagination
│   ├── eventService.ts         GET /events
│   ├── flightRoute.ts          POST to adsb.lol routeset API
│   ├── geocodeService.ts       GET /geocode with LRU cache (64 entries)
│   ├── trafficService.ts       GET /roads with LRU cache (8 entries)
│   ├── weatherService.ts       GET /weather
│   └── weatherTileService.ts   RainViewer public API (5-min TTL)
│
├── shaders/                    GLSL post-processing effects
│   ├── types.ts                ShaderMode union + SHADER_CONFIGS
│   ├── ShaderManager.ts        PostProcessStage lifecycle manager
│   ├── nightVision.ts          NVG (green tint, bloom, grain, vignette)
│   ├── flir.ts                 FLIR (thermal palette, targeting reticle)
│   ├── crt.ts                  CRT (barrel distortion, scanlines, chromatic)
│   └── anime.ts                Anime (Sobel edges, posterization, saturation)
│
├── data/
│   └── capitals.ts             120+ world capitals with lat/lon/population
│
├── workers/
│   ├── overpassWorker.ts       Web Worker for Overpass JSON parsing
│   └── tleWorker.ts            Web Worker stub for TLE propagation
│
└── components/                 15 domain component groups (see next page)
```

## Bootstrap Flow

1. **`main.tsx`** — Initializes the Cesium Ion access token, then mounts `<App />` to the DOM
2. **`App.tsx`** — Calls `useAppState()` which:
   - Creates `useAircraftStore()` and `useSatelliteStore()` instances
   - Sets up `handleWsMessage` callback routing incoming WS messages
   - Passes the handler to `useWebSocket()` which auto-connects
   - Runs 4 `useEffect` side effects for on-demand data (cameras, weather, events, flight routes)
3. **`App.tsx` render** — Mounts the component tree:
   - `Globe` → all visualization layers
   - `Sidebar` → all filter/control panels
   - Conditionally: `SearchBar`, `Minimap`, `Timeline`, `AlertSystem`, `ConnectionStatus`
   - Conditionally: `AircraftPopup`, `SatellitePopup`, `EventPopup`, `MetarPopup`
   - Conditionally: `CameraPlayer` (when a camera is selected)
   - Conditionally: `NvgHud` / `FlirHud` / `CrtHud` (based on active shader)

## Styling Approach

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin — no `tailwind.config.js` needed
- **Dark theme throughout**: `zinc-950` / `zinc-900` backgrounds
- **Accent color**: `emerald-400` (`#34d399`)
- **Font stack**: JetBrains Mono → SF Mono → Fira Code (monospace)
- **Aesthetic**: Military/surveillance — uppercase tracking, monospace, subtle glow effects
- All styles are inline Tailwind classes — no CSS modules or styled-components

## Build Configuration

**Vite** (`vite.config.ts`):
- Three plugins: `@vitejs/plugin-react`, `vite-plugin-cesium`, `@tailwindcss/vite`
- Dev server on port 5173
- Vitest configured with `jsdom` environment and global test utilities
- Test pattern: `src/**/*.test.{ts,tsx}`
