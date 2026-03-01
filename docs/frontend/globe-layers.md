# 3D Globe & Visualization Layers

The globe is the core of SeeYou's UI. It uses CesiumJS (via Resium) with 9 data visualization layers, each implemented as an imperative Cesium integration for maximum performance.

## Globe Component

`Globe.tsx` wraps Resium's `<Viewer>` component and mounts all layers:

```tsx
<Viewer ref={viewerRef}>
  <AircraftLayer ... />
  <SatelliteLayer ... />
  <TrafficLayer ... />
  <CameraLayer ... />
  <WeatherLayer ... />
  <WindParticleLayer ... />
  <MetarLayer ... />
  <EventLayer ... />
  <CityLabelsLayer ... />
</Viewer>
```

Each layer accesses the Cesium `Viewer` instance through Resium's `useCesium()` hook.

## Layer Architecture

All layers follow the same imperative pattern — they return `null` from React render and manage Cesium entities directly:

```
useEffect(() → {
  const dataSource = new CustomDataSource("layer-name");
  viewer.dataSources.add(dataSource);

  // Batch entity operations
  dataSource.entities.suspendEvents();
  // ... add/update/remove entities ...
  dataSource.entities.resumeEvents();

  return () → viewer.dataSources.remove(dataSource);
}, [dependencies]);
```

## Aircraft Layer

**Files**: `AircraftLayer.tsx`, `AircraftBillboards.tsx`, `AircraftInteractions.ts`, `AircraftPopup.tsx`, `AircraftPredictions.tsx`, `AircraftRouteOverlay.tsx`, `AircraftTooltip.tsx`, `aircraftUtils.ts`

**Rendering**:
- `AircraftBillboards` performs incremental diffing (`computeEntityDiff`) — only adds new, updates changed, and removes stale aircraft
- Additions chunked via `requestAnimationFrame` (500 per frame) to avoid frame drops
- SVG billboard icons rotated by heading, colored by type (civilian blue, military red)
- `NearFarScalar` for distance-based scaling
- `DistanceDisplayCondition` for label visibility

**Interactions**:
- `ScreenSpaceEventHandler` captures LEFT_CLICK (select) and MOUSE_MOVE (hover)
- Click selects an aircraft → triggers flight route fetch → shows `AircraftPopup`
- Hover shows `AircraftTooltip` via React Portal to `document.body`

**Route Overlay**:
- `AircraftRouteOverlay` draws departure → aircraft → arrival polyline
- Uses `CallbackProperty` for real-time aircraft position updates
- Color-coded segments: past route (dim), current position (bright), future route (dashed)

**Military Predictions**:
- `AircraftPredictions` renders predicted trajectories as dashed polylines
- Uncertainty ellipses grow along the prediction horizon
- Only shown for military aircraft with active IMM-EKF predictions

**Utilities** (`aircraftUtils.ts`):
- SVG icon generation for aircraft types
- Dead-reckoning via `SampledPositionProperty` for smooth interpolation between updates
- Viewport culling: `computeViewRectangle()` + `Rectangle.contains()`
- Entity diff computation: compares Map snapshots to produce add/update/remove sets

## Satellite Layer

**Files**: `SatelliteLayer.tsx`, `SatelliteOrbit.tsx`, `SatellitePopup.tsx`

- Per-category SVG icons (Station, Starlink, Military, Weather, Navigation, etc.)
- Viewport culling using `Occluder.isPointVisible()` for globe occlusion
- Great-circle orbit path approximation drawn as dashed polylines
- ISS highlighted with special styling
- LOD-aware: orbit paths only shown at lower altitudes

## Traffic Layer

**Files**: `TrafficLayer.tsx`, `ParticleEngine.ts`, `trafficConstants.ts`, `trafficUtils.ts`, `useTrafficLoader.ts`

- Road network drawn as colored polylines (motorway red, trunk orange, primary yellow, secondary green)
- `ParticleEngine` class manages 2,000 animated particles flowing along road segments
- Particle speed and density vary by road type and time of day (rush hour multiplier)
- `useTrafficLoader` debounces viewport changes (400ms) and loads roads for visible bounding box
- Roads hidden above 50km altitude to reduce visual clutter

## Camera Layer

**Files**: `CameraLayer.tsx`, `CameraPanel.tsx`, `CameraPlayer.tsx`, `cameraIcon.ts`

- Camera positions shown as billboards with online (green) / offline (red) icons
- Click opens `CameraPlayer` — a draggable video player supporting:
  - **HLS** streams via HLS.js
  - **MJPEG** direct image streaming
  - **ImageRefresh** periodic image reload
- All camera streams proxied through backend (`/cameras/proxy`) to bypass CORS

## Weather Layer

**Files**: `WeatherLayer.tsx`, `WindParticleLayer.tsx`

**Radar** (`WeatherLayer`):
- RainViewer radar tiles rendered as CesiumJS `ImageryLayer`
- Animated playback of historical frames (10-min intervals)
- Configurable opacity via sidebar slider

**Wind** (`WindParticleLayer`):
- Canvas-based particle system with 4,000 particles
- Inverse Distance Weighting (IDW) interpolation from 40 weather grid points
- Particles respect globe occlusion (hidden on far side)
- Speed and direction from Open-Meteo wind data

## METAR Layer

**Files**: `MetarLayer.tsx`, `MetarPopup.tsx`

- Aviation weather stations displayed as colored circles by flight category:
  - **VFR** (green), **MVFR** (blue), **IFR** (red), **LIFR** (magenta)
- Maximum 600 stations visible (camera-distance culling)
- Throttled camera updates (250ms) for performance
- Popup shows temperature, wind, visibility, ceiling, raw METAR text

## Event Layer

**Files**: `EventLayer.tsx`, `EventPopup.tsx`

- Per-category SVG icons: wildfires (flame), storms (lightning), volcanoes, earthquakes, floods, ice
- Subtle glow effect on event icons
- Popup includes category badge, date, coordinates, and NASA source link

## City Labels Layer

**File**: `CityLabelsLayer.tsx`

- 120+ world capital cities from static dataset
- Population-based visibility distance (larger cities visible from higher altitude)
- Labels use `DistanceDisplayCondition` for automatic LOD

## Performance Techniques Summary

| Technique | Where Used | Benefit |
|-----------|-----------|---------|
| `CustomDataSource` (imperative) | All layers | Bypass React reconciliation |
| `suspendEvents()` / `resumeEvents()` | Batch entity updates | Single scene update per batch |
| Incremental entity diffing | Aircraft | Avoid full recreation |
| `requestAnimationFrame` chunking | Aircraft additions | Smooth frame rate |
| `NearFarScalar` | All billboards | Distance-based size |
| `DistanceDisplayCondition` | Labels, orbits | Altitude-based visibility |
| Viewport culling | Aircraft, Satellites, METAR | Skip off-screen entities |
| Globe occlusion | Satellites, Wind | Skip far-side entities |
| Camera change throttling | Multiple layers | Reduce update frequency |
| Altitude gating | Traffic, METAR | Hide irrelevant data |
