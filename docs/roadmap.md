# Roadmap

SeeYou development follows an 8-phase plan, from foundations to polish.

## Phase 1: Foundations ✅

- CesiumJS 3D globe with Resium React bindings
- Axum backend with WebSocket support
- Redis caching layer with Docker Compose
- Tailwind CSS v4 dark theme
- Environment configuration system

## Phase 2: Real-Time Aircraft ✅

- ADS-B data integration via adsb.lol API
- Regional + military aircraft fetching (44 grid points)
- Chunked WebSocket delivery (2,000 per chunk)
- Aircraft billboards with heading rotation
- Click-to-select with detail popup
- Civilian/military filters
- Flight route overlay (departure → aircraft → arrival)
- Dead-reckoning interpolation for smooth movement

## Phase 3: Satellite Tracking ✅

- CelesTrak TLE data integration
- SGP4 orbital propagation with WGS-84 conversion
- 8-category satellite classification
- Per-category SVG icons
- Orbit path visualization
- ISS special highlighting
- TLE caching (6-hour refresh)

## Phase 4: Traffic Visualization ✅

- Overpass API integration for road network data
- Road type classification (motorway, trunk, primary, secondary)
- Color-coded road polylines
- Animated particle engine (2,000 particles)
- Time-of-day density variation
- Viewport-debounced loading with bbox caching
- Altitude gating (hidden above 50km)

## Phase 5: CCTV Camera System ✅

- 6-provider camera aggregation (TfL, NYC DOT, Caltrans, OpenTrafficCamMap, mcp.camera, Generic)
- Batch health checking with online/offline status
- HLS / MJPEG / ImageRefresh stream support
- Backend stream proxy for CORS bypass
- Draggable video player
- Chunked frontend loading with progress indicator

## Phase 6: Tactical Shaders ✅

- Night Vision (NVG) GLSL shader
- Forward-Looking Infrared (FLIR) shader
- CRT display shader
- Anime stylization shader
- ShaderManager class for lifecycle management
- Per-shader HUD overlays
- Keyboard shortcuts (1-5)

## Phase 7: God Mode UI ✅

- Sidebar with per-domain filter controls
- Unified search bar (Cmd+K)
- SVG minimap with viewport rectangle
- UTC timeline with time navigation
- Auto-dismissing alert system
- Connection status indicator
- Keyboard shortcut system
- Camera/cursor coordinate displays

## Phase 8: Polish & Performance 🔄

- [ ] IMM-EKF military trajectory prediction engine ✅
- [ ] Pattern detection (orbit, CAP, transit, holding) ✅
- [ ] Aviation weather (METAR) integration ✅
- [ ] Natural events (NASA EONET) integration ✅
- [ ] Weather radar + wind particles ✅
- [ ] City labels layer ✅
- [ ] Entity API → Primitives API migration (planned)
- [ ] Web Worker TLE propagation (stub exists)
- [ ] Expanded test coverage
- [ ] CI/CD pipeline
- [ ] Production deployment configuration
- [ ] Performance profiling and optimization

## Future Ideas

- **OpenSky Network** — Alternative aircraft data source (API exists in code but no integration)
- **Ship tracking** — AIS data integration for maritime vessels
- **Drone detection** — Low-altitude UAV tracking
- **Historical playback** — Time-travel through recorded data
- **Multi-user collaboration** — Shared views and annotations
- **Mobile responsive** — Touch-optimized controls
- **Offline mode** — Cached data for disconnected operation
