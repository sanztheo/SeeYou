# UI Components

## Sidebar

The sidebar is a 280px fixed-width panel on the left side of the screen, toggled with the `B` key. It contains filter controls for every data domain.

### Sidebar Sections

| Section | Component | Controls |
|---------|-----------|----------|
| Aircraft counts | `AircraftCounter` | Total / Civilian / Military count grid |
| Aircraft filters | `AircraftFilters` | Civilian on/off, Military on/off toggle switches |
| Satellite counts | `SatelliteCounter` | Total / Station / Military / Starlink count grid |
| Satellite filters | `SatelliteFilters` | 8-category toggle grid (Station, Starlink, Communication, Military, Weather, Navigation, Science, Other) |
| Traffic | `TrafficControls` | Enable toggle + road type toggles (Motorway, Trunk, Primary, Secondary) + loading progress bar |
| Cameras | `CameraFilters` | Enable toggle + source/city pill filters + chunked loading progress indicator |
| Weather | `WeatherControls` | Enable toggle + Radar/Wind sub-toggles + opacity slider + animation speed slider |
| METAR | `MetarFilters` | Enable toggle + flight category pills (VFR, MVFR, IFR, LIFR) |
| Events | `EventFilters` | Enable toggle + event category pills with live counts |

## Search Bar

`SearchBar.tsx` provides unified search across all domains, activated by `Cmd+K` or `/`:

**Search targets:**
- Aircraft (by callsign or ICAO hex)
- Satellites (by name or NORAD ID)
- Cameras (by name or city)
- Cities (via backend `/geocode` API)

Results are grouped by domain with keyboard navigation support. Selecting a result flies the camera to that location.

## Camera Player

`CameraPlayer.tsx` is a draggable video player that opens when a camera is selected:

**Stream types supported:**
- **HLS** — HTTP Live Streaming via HLS.js library
- **MJPEG** — Direct motion JPEG streaming
- **ImageRefresh** — Periodic image reload (for snapshot cameras)

All streams are proxied through the backend's `/cameras/proxy` endpoint to bypass CORS restrictions. The player is draggable within the viewport.

## Minimap

`Minimap.tsx` renders a 160×160px SVG world overview in the bottom-right corner:

- Continental outlines drawn as SVG paths
- Current viewport shown as a semi-transparent rectangle
- Mercator projection for the overview
- Click-to-navigate support

## Timeline

`Timeline.tsx` shows a bottom bar with:

- **UTC clock** — Current time in UTC
- **LIVE indicator** — Pulsing green dot when receiving data
- **Time controls** — ±1 minute and ±5 minute jump buttons
- **Clickable timeline bar** — Scrub through recent history

## Alert System

`AlertSystem.tsx` provides auto-dismissing toast notifications for:

- **Military aircraft entry** — When a new military aircraft appears
- **ISS passes** — When the International Space Station passes overhead
- Toasts appear in the top-right, auto-dismiss after 5 seconds
- Stacks up to 3 visible toasts

## Connection Status

`ConnectionStatus.tsx` shows the WebSocket connection state:

| State | Visual |
|-------|--------|
| Connected | Green dot + "Connected" |
| Connecting | Yellow dot + "Connecting..." |
| Disconnected | Red dot + "Disconnected" |

## Shared UI Primitives

| Component | File | Purpose |
|-----------|------|---------|
| `Badge` | `Badge.tsx` | Reusable badge with optional pulse animation |
| `Tooltip` | `Tooltip.tsx` | 4-position tooltip with arrow and configurable delay |
| `TransitionWrapper` | `TransitionWrapper.tsx` | Animated mount/unmount (fade, slide directions) |
| `LoadingStates` | `LoadingStates.tsx` | `LayerLoading` spinner + `GlobalLoadingOverlay` |
| `ErrorBoundary` | `ErrorBoundary.tsx` | React error boundary with military-styled error display |
| `ApiStatus` | `ApiStatus.tsx` | Expandable multi-service health indicator |

## Popup Components

| Popup | Trigger | Content |
|-------|---------|---------|
| `AircraftPopup` | Click aircraft | Callsign, altitude, speed, heading, vertical rate, route (DEP→ARR), military predictions with uncertainty |
| `SatellitePopup` | Click satellite | Name, NORAD ID, category badge, altitude, velocity, orbit period. ISS gets special highlight |
| `EventPopup` | Click event | Category badge, title, date, coordinates, NASA EONET source link |
| `MetarPopup` | Click METAR station | Station ID, temperature, dewpoint, wind, visibility, ceiling, flight category, raw METAR text |
