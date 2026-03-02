# UI Components

## Sidebar (IconRail + SidePanel)

The sidebar uses a two-part architecture: a persistent **IconRail** (44px) and a slide-in **SidePanel** (260px). Total width when open: 304px. The rail is hidden in fullscreen mode.

### IconRail (`Sidebar/IconRail.tsx`)

Fixed 44px vertical bar on the left edge with:
- **Connection status** — Green/amber/red dot + "SY" label at top
- **8 section buttons** — Each with an SVG icon and 3-letter label (AIR, SAT, TFC, CAM, WX, MET, EVT, INT)
- **Active indicator** — Emerald left border bar + highlighted background on the active section
- **Version label** — "v2.0" at the bottom
- Clicking a section toggles the `SidePanel` for that section; clicking the active section closes it

### SidePanel (`Sidebar/SidePanel.tsx`)

260px slide-in panel positioned to the right of the IconRail (`left-[44px]`). Features:
- Header with uppercase section title + close button
- Scrollable content area with `scrollbar-thin`
- `panel-grain` background texture + `animate-slide-in` entrance
- `backdrop-blur-xl` frosted glass effect

### Sidebar Sections

| Section ID | Panel Title | Component | Controls |
|------------|-------------|-----------|----------|
| `aircraft` | Aircraft | `AircraftCounter` + `AircraftFilters` | Total / Civilian / Military count grid + toggle switches |
| `satellites` | Satellites | `SatelliteCounter` + `SatelliteFilters` | Category counts + 8-category toggle grid |
| `traffic` | Traffic | `TrafficControls` | Enable toggle + road type toggles + loading progress |
| `cameras` | Cameras | `CameraFilters` | Enable toggle + source/city pill filters + progress |
| `weather` | Weather | `WeatherControls` | Enable toggle + Radar/Wind sub-toggles + opacity slider |
| `metar` | METAR | `MetarFilters` | Enable toggle + flight category pills (VFR, MVFR, IFR, LIFR) |
| `events` | Events | `EventFilters` | Enable toggle + event category pills with live counts |
| `intel` | Intelligence | `IntelligenceFilters` | Toggles + counts for cables, seismic, fires, GDELT, military, nuclear, maritime, cyber, space weather |

## Search Bar

`SearchBar.tsx` provides unified search across all domains, activated by `Cmd+K` or `/`. Position adjusts based on `sidebarOpen` state.

**Search targets (8 local + 1 geocode):**

| Group | Match fields | Max results |
|-------|-------------|-------------|
| Aircraft | callsign, ICAO hex, aircraft_type | 6 |
| Satellites | name, NORAD ID, category | 6 |
| Cameras | name, city, id | 6 |
| Military Bases | name, country, branch | 6 |
| Nuclear Sites | name, country, type | 6 |
| Submarine Cables | name, owners | 6 |
| Earthquakes | title, magnitude, "tsunami" keyword | 6 |
| Vessels | MMSI, name, destination | 6 |
| Cities | geocode API (debounced 300ms, `AbortController`) | unlimited |

Results are grouped by domain with headers showing match count. Selecting a local result dispatches the appropriate `onSelect*` callback; selecting a city triggers `onFlyToCity` with 50km altitude. Click-outside or Escape closes the dropdown.

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

## DraggablePanel

`DraggablePanel.tsx` wraps all detail popups in the right column. Drag the header (top 44px) to detach and reposition; double-click the header to re-dock. Detached panels get `position: fixed` and maintain a global z-index stack for correct layering. Buttons and links within the header are excluded from drag initiation.

## Timeline

`Timeline.tsx` shows a bottom bar with responsive left padding (`pl-[304px]` when sidebar open, `pl-[44px]` when collapsed):

- **UTC clock** — Current time formatted HH:MM:SS UTC
- **LIVE indicator** — Pulsing green dot when receiving real-time data
- **Play/Pause** — Toggles live mode on/off
- **Time controls** — ±1 minute and ±5 minute jump buttons
- **Clickable timeline bar** — 1-hour span with 10-minute tick marks, click to scrub

## Alert System

`AlertSystem.tsx` provides auto-dismissing toast notifications for:

- **Military aircraft entry** — When a new military aircraft appears
- **ISS passes** — When the International Space Station passes overhead
- Toasts appear in the top-right, auto-dismiss after 5 seconds
- Stacks up to 3 visible toasts

## Connection Status

Connection state is shown as a colored dot at the top of the `IconRail` (no separate component):

| State | Visual |
|-------|--------|
| `connected` | Green dot with emerald glow |
| `connecting` | Amber dot with pulse animation |
| `disconnected` | Red dot |

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

All popups render inside `DraggablePanel` wrappers in a scrollable right-side column (`fixed top-2 right-2 bottom-12 w-[280px]`). Multiple popups can be open simultaneously.

| Popup | Trigger | Content |
|-------|---------|---------|
| `AircraftPopup` | Click aircraft | Callsign, altitude, speed, heading, vertical rate, route (DEP→ARR), military predictions with uncertainty |
| `SatellitePopup` | Click satellite | Name, NORAD ID, category badge, altitude, velocity, orbit period. ISS gets special highlight |
| `EventPopup` | Click event | Category badge, title, date, coordinates, NASA EONET source link |
| `MetarPopup` | Click METAR station | Station ID, temperature, dewpoint, wind, visibility, ceiling, flight category, raw METAR text |
| `EarthquakePopup` | Click earthquake | Magnitude, title, location, depth, tsunami flag |
| `FirePopup` | Click fire | Fire details, location, intensity |
| `CablePopup` | Click cable | Cable name, owners, length, landing points |
| `MilitaryBasePopup` | Click military base | Base name, country, branch, coordinates |
| `NuclearSitePopup` | Click nuclear site | Site name, country, facility type |
| `VesselPopup` | Click vessel | MMSI, name, vessel type, flag, destination |
| `CyberThreatPopup` | Click cyber threat | Threat details, source, target |
| `GdeltPopup` | Click GDELT event | Event details, actors, source URL |
| `SpaceWeatherPopup` | Click aurora legend | Kp index, active alerts, space weather status |
