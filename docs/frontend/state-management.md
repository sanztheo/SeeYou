# State Management

SeeYou uses **zero external state libraries**. All state flows through custom React hooks built on `useState`, `useRef`, `useCallback`, and `useEffect`.

## Architecture Overview

```
useAppState() ─── Central orchestrator (455 lines)
├── useAircraftStore() ── Map<icao, AircraftPosition> + batch ingestion
├── useSatelliteStore() ── Map<norad_id, SatellitePosition> + batch ingestion
├── useWebSocket() ── Auto-reconnecting WS client
├── 15+ useState slices ── Filters, selections, UI state, loading flags
└── 4 useEffect chains ── Side-effect data fetching
```

## useAppState — The Central Hub

This hook (455 lines) is the single source of truth. It returns the `AppState` type consumed by `App.tsx` and distributed to all children via props.

### State Slices

| State | Type | Purpose |
|-------|------|---------|
| `aircraft` | `Map<string, AircraftPosition>` | All tracked aircraft, keyed by ICAO hex |
| `satellites` | `Map<number, SatellitePosition>` | All tracked satellites, keyed by NORAD ID |
| `predictions` | `Map<string, PredictedTrajectory>` | Military trajectory predictions |
| `cameras` | `Camera[]` | All CCTV cameras |
| `weatherGrid` | `WeatherGrid \| null` | Weather data points |
| `rainViewerData` | `RainViewerData \| null` | Radar tile URLs and timestamps |
| `metarStations` | `MetarStation[]` | Aviation weather observations |
| `events` | `NaturalEvent[]` | Active natural events |
| `selectedAircraft` | `AircraftPosition \| null` | Currently selected aircraft |
| `selectedSatellite` | `SatellitePosition \| null` | Currently selected satellite |
| `flightRoute` | `FlightRoute \| null` | Route for selected aircraft |
| `aircraftFilter` | `AircraftFilter` | Show civilian / military toggles |
| `satelliteFilter` | `SatelliteFilter` | 8-category toggle set |
| `cameraFilter` | `CameraFilter` | Enable + source/city filters |
| `trafficFilter` | `TrafficFilter` | Enable + road type toggles |
| `weatherFilter` | `WeatherFilter` | Enable + radar/wind sub-toggles |
| `metarFilter` | `MetarFilter` | Enable + category filters |
| `eventFilter` | `EventFilter` | Enable + category filters |
| `connectionStatus` | `ConnectionStatus` | WS connection state |
| `cameraLoadingProgress` | `number` | 0-100% camera chunk progress |

### WebSocket Message Dispatch

The `handleWsMessage` callback routes incoming messages to the correct state update:

```
WsMessage.type → Handler
─────────────────────────
AircraftBatch  → aircraftStore.ingestBatch(aircraft, chunk_index, total_chunks)
SatelliteBatch → satelliteStore.ingestBatch(satellites, chunk_index, total_chunks)
MetarUpdate    → setMetarStations(stations)
Predictions    → setPredictions(Map from trajectories)
Connected      → log client_id
Ping           → (auto-handled by useWebSocket)
Error          → console.error
```

### Side-Effect Chains

| Effect | Trigger | What It Does |
|--------|---------|--------------|
| Flight route | `selectedAircraft?.icao` changes | Fetches route from adsb.lol with AbortController |
| Cameras | `cameraFilter.enabled` becomes true | Chunked fetch with retry (max 3), progress callback |
| Weather | `weatherFilter.enabled` becomes true | Parallel fetch of grid + RainViewer, 10-min auto-refresh |
| Events | `eventFilter.enabled` becomes true | Fetch events, 30-min auto-refresh |

All effects use `AbortController` or `cancelled` flags for cleanup on unmount.

## useWebSocket — Real-Time Connection

Manages the WebSocket lifecycle with automatic reconnection:

- **Connects** to `WS_URL` (configured via `VITE_WS_URL`)
- **Reconnects** on close/error with exponential backoff: `2000ms × 1.5^attempt`
- **Max attempts**: 10 (then stops until page refresh)
- **Heartbeat**: Responds to `Ping` with `Pong` automatically
- **Exposes**: `connectionStatus` enum (`connected`, `connecting`, `disconnected`)

## useAircraftStore — Chunked Batch Accumulation

Manages a `Map<string, AircraftPosition>` with a chunked ingestion pipeline:

```
WebSocket AircraftBatch messages arrive in N chunks
  │
  ▼
useRef buffer accumulates chunks (keyed by chunk_index)
  │
  ▼ (all chunks received? chunk_index === total_chunks - 1)
  │
  ▼
Flush: merge buffered aircraft into Map, replacing stale entries
  │
  ▼
setState triggers re-render → layers receive new Map
```

The accumulation logic is extracted into `batchAccumulator.ts` as a pure function for unit testing.

## useSatelliteStore — Progressive Chunk Rendering

Unlike `useAircraftStore` which buffers all chunks before flushing, `useSatelliteStore` updates state **after each chunk** for progressive rendering:

```
WebSocket SatelliteBatch messages arrive in N chunks
  │
  ▼
chunk_index === 0? → clear previous Map, start fresh
  │
  ▼
Merge chunk positions into Map immediately → setSatellites()
  │
  ▼
setState triggers re-render → SatelliteLayer renders available satellites
  │
  ▼
Next chunk arrives → merge into growing Map → re-render
  │
  ▼
All chunks received → tracking refs reset
```

This means satellites appear on the globe within 1-2 seconds of the first chunk arriving, instead of waiting 5-10 seconds for all ~10,000 satellites to transfer.

## useLevelOfDetail — Altitude-Based Configuration

Returns LOD settings based on the camera's altitude above the globe:

```typescript
interface LodConfig {
  maxEntities: number;
  showLabels: boolean;
  pointSize: number;
  showOrbits: boolean;
}
```

| Altitude Range | Max Entities | Labels | Orbits |
|---------------|-------------|--------|--------|
| < 50 km | Unlimited | Yes | Yes |
| 50–200 km | 5,000 | Yes | No |
| 200–1000 km | 2,000 | No | No |
| > 1000 km | 1,000 | No | No |

## useClustering — Grid-Based Entity Grouping

Generic clustering hook that groups entities into grid cells based on their geographic position and the current zoom level. Used to reduce visual clutter at high altitudes.

## useViewerCallbacks — Camera & Cursor Tracking

Tracks two pieces of information from the Cesium viewer:

1. **CameraState** — `{ altitude, heading, pitch, lat, lon }` updated on camera move (throttled 80ms)
2. **CursorState** — `{ lat, lon }` updated on mouse move, with `Cartographic.fromCartesian` conversion

These feed the HUD overlays (`CameraInfo` and `CursorCoords`).

## useKeyboardShortcuts — Global Keybindings

Registers document-level `keydown` listeners:

| Key | Action |
|-----|--------|
| `1` | Night Vision shader |
| `2` | FLIR shader |
| `3` | CRT shader |
| `4` | Anime shader |
| `5` | Reset to default |
| `F` | Toggle fullscreen |
| `B` | Toggle sidebar visibility |
| `/` | Focus search bar |

## Data Flow Summary

```
External APIs
     │
     ▼
Backend Trackers (poll loops)
     │
     ├──► Redis Cache
     │
     ├──► WebSocket Broadcast ──► useWebSocket ──► handleWsMessage ──► stores
     │
     └──► REST API ──► services/ ──► useAppState effects ──► state
                                                                │
                                                                ▼
                                                        App.tsx (props)
                                                                │
                                              ┌─────────────────┼─────────────────┐
                                              ▼                 ▼                 ▼
                                         Globe layers     Sidebar panels     Popup components
```
