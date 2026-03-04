# 3D Globe & Visualization Layers

The globe is the core of SeeYou's UI. It uses CesiumJS (via Resium) with 12 data visualization layers, each implemented as an imperative Cesium integration for maximum performance.

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

All layers follow the same imperative pattern — they return `null` from React render and manage **CesiumJS Primitive collections** directly for GPU-batched rendering:

```
useEffect(() → {
  // Primitive collections: all objects batched into 1-2 GPU draw calls
  const bbColl = viewer.scene.primitives.add(
    new BillboardCollection({ scene: viewer.scene })
  );
  const lblColl = viewer.scene.primitives.add(
    new LabelCollection({ scene: viewer.scene })
  );

  return () → {
    viewer.scene.primitives.remove(bbColl);
    viewer.scene.primitives.remove(lblColl);
  };
}, [viewer]);
```

Each billboard/label/point is added to a collection with an `id` property used for `scene.pick()` interaction. Collections handle frustum culling automatically — no manual viewport checks needed.

> **Why Primitives over Entity API?** The Entity API wraps each object in a property-tracking system with per-frame evaluation. With 5,000+ aircraft, that's 5,000 interpolation evaluations per frame. Primitive collections batch all objects into 1-2 GPU draw calls with near-zero CPU overhead. Result: **~8,000 draw calls → ~15 draw calls**, 10-50x FPS improvement.

## Aircraft Layer

**Files**: `AircraftLayer.tsx`, `AircraftBillboards.tsx`, `AircraftInteractions.ts`, `AircraftPopup.tsx`, `AircraftPredictions.tsx`, `AircraftRouteOverlay.tsx`, `AircraftTooltip.tsx`, `aircraftUtils.ts`

**Rendering** (Primitive collections):
- `AircraftLayer` initializes a `BillboardCollection` + `LabelCollection` added to `viewer.scene.primitives`
- `useAircraftBillboards` hook manages an entry map (`Map<icao, { billboard, label }>`) for incremental updates
- On each aircraft state change: adds new, updates positions/icons for existing, removes departed
- SVG billboard icons rotated by heading (`rotation` property), colored by type (civilian blue `#4fc3f7`, military red `#ef5350`)
- `NearFarScalar` for distance-based scaling — automatic frustum culling by the collection

**Interactions**:
- `ScreenSpaceEventHandler` captures LEFT_CLICK (select) and MOUSE_MOVE (hover)
- Picking uses `scene.pick()` — billboard `id` (string) maps to ICAO hex, with `extractIcao()` helper for Entity/Billboard polymorphism
- Click selects an aircraft → triggers flight route fetch → shows `AircraftPopup`
- Hover shows `AircraftTooltip` via React Portal to `document.body`

**Route Overlay & Tracking**:
- Flight route and predictions still use `CustomDataSource` (polylines, low count)
- A dedicated `tracking` `CustomDataSource` holds a single Entity for `viewer.trackedEntity` camera lock
- The tracking entity uses `SampledPositionProperty` for smooth dead-reckoning interpolation

**Military Predictions**:
- `AircraftPredictions` renders predicted trajectories as dashed polylines on a `CustomDataSource`
- Uncertainty ellipses grow along the prediction horizon
- Only shown for military aircraft with active IMM-EKF predictions

**Utilities** (`aircraftUtils.ts`):
- SVG icon generation for aircraft types
- Dead-reckoning via `SampledPositionProperty` for smooth interpolation between updates
- `filterVisibleAircraft()` applies user filter criteria (civilian/military toggles)

## Satellite Layer

**Files**: `SatelliteLayer.tsx`, `SatelliteOrbit.tsx`, `SatellitePopup.tsx`

**Rendering** (Primitive collections):
- `BillboardCollection` for satellite icons + `LabelCollection` for names
- Entry map (`Map<noradId, { billboard, label }>`) for incremental add/update/remove
- Per-category SVG icons (Station, Starlink, Military, Weather, Navigation, etc.)
- ISS highlighted with special styling
- `NearFarScalar` + `DistanceDisplayCondition` for automatic LOD (labels fade beyond 10,000 km)
- Module-level `NearFarScalar`/`DistanceDisplayCondition` constants (avoids GC allocation)

**Progressive Loading**:
- `useSatelliteStore` calls `setSatellites()` after each WebSocket chunk (not after all chunks)
- Satellites appear on the globe as data arrives — no waiting for complete dataset
- First chunk clears the previous batch; subsequent chunks merge into the growing `Map`

**Interactions**:
- `ScreenSpaceEventHandler` with billboard `id` lookup against a local `Map<id, SatellitePosition>`
- Great-circle orbit path approximation drawn as dashed polylines (Entity API — low count)

## Traffic Layer

**Files**: `TrafficLayer.tsx`, `ParticleEngine.ts`, `trafficConstants.ts`, `trafficUtils.ts`, `useTrafficLoader.ts`

**Road Polylines** (Entity API — `CustomDataSource`):
- Road network drawn as colored polylines with `clampToGround: true` (motorway red, trunk orange, primary yellow, secondary green)
- Roads retained on Entity API because `PolylineCollection` does not support ground clamping
- Road count is low (~hundreds), so Entity overhead is negligible

**Particle Flow** (Primitive collection):
- `ParticleEngine` class manages ~2,000 animated particles via `PointPrimitiveCollection`
- Each particle is a `PointPrimitive` with direct `position` updates per frame — no Entity property evaluation
- Particle speed and density vary by road type and time of day (rush hour multiplier)
- `NearFarScalar` on each point for distance-based scaling

**Data Loading**:
- `useTrafficLoader` debounces viewport changes (400ms) and loads roads for visible bounding box
- Roads and particles hidden above 50km altitude (`collection.show = false` / `ds.show = false`)

## Camera Layer

**Files**: `CameraLayer.tsx`, `CameraFocusLayer.tsx`, `CameraPanel.tsx`, `CameraPlayer.tsx`, `cameraIcon.ts`, `cameraView.ts`

**Rendering** (Primitive collection):
- `BillboardCollection` for camera icons with `id` = camera UUID
- Online (green) / offline (red) SVG icons via `cameraIcon.ts`
- `NearFarScalar` for distance-based scaling (full size at 5 km, near-invisible at 8,000 km)
- Local `Map<id, Camera>` for pick-based lookup

**Interactions**:
- `ScreenSpaceEventHandler` picks billboard by `id` → opens `CameraPlayer`
- Camera selection (map/sidebar/search) triggers `flyTo` focus with heading/pitch aligned to camera orientation
- `CameraFocusLayer` renders a single active view cone (polygon + centerline axis) for the selected camera
- `cameraView.ts` resolves heading/FOV with priority: provider metadata → hint/name parsing → city-centroid fallback
- `CameraPlayer` — draggable video player supporting HLS (via HLS.js), MJPEG, ImageRefresh, plus DIR/FOV metadata
- All camera streams proxied through backend (`/cameras/proxy`) to bypass CORS

## Weather Layer

**Files**: `WeatherLayer.tsx`, `WindParticleLayer.tsx`

**Radar** (`WeatherLayer`):
- RainViewer radar tiles rendered as CesiumJS `ImageryLayer`
- Animated playback of historical frames (10-min intervals)
- Configurable opacity via sidebar slider

**Wind** (`WindParticleLayer`):
- Canvas-based particle system with 4,000 particles
- Wind interpolation via **precomputed IDW grid** (`buildWindGrid`) — each grid cell stores pre-interpolated wind speed/direction from ~40 weather points
- Particle lookup is O(1) per frame via `gridLookup()` instead of O(N) IDW per particle per frame
- Particles respect globe occlusion (hidden on far side via `Occluder.isPointVisible()`)
- Speed and direction from Open-Meteo wind data

**Temperature** (`TemperatureLayer`):
- Renders global temperature as a color-mapped `ImageryLayer` with dual-provider fallback strategy
- **Primary**: OpenWeatherMap tile API (`temp_new/{z}/{x}/{y}`) via `UrlTemplateImageryProvider` — probed at startup with a HEAD request
- **Fallback**: Open-Meteo grid API (10° resolution, -80° to 80° lat) with client-side bilinear interpolation rendered to a 1024×512 canvas → `SingleTileImageryProvider`
- Temperature color scale: 10 stops from -40°C (purple) through 0°C (teal) to 50°C (dark red), alpha 180/255
- Opacity controlled via props, updated without layer re-creation
- Cleanup removes the `ImageryLayer` and aborts in-flight fetches

## Military Bases Layer

**File**: `MilitaryBasesLayer.tsx`

**Rendering** (Primitive collection):
- `BillboardCollection` for diamond-shaped canvas icons with `id` = `mil::{name}::{country}`
- Branch-based coloring via `BRANCH_COLORS`: air (`#60A5FA`), army (`#34D399`), naval (`#818CF8`), intelligence (`#F472B6`)
- `createDiamondCanvas()` generates 32×32 diamond icons with white stroke, cached per color in a module-level `Map`
- `NearFarScalar(1e5, 1.5, 1e7, 0.4)` + `DistanceDisplayCondition(0, 3e7)`
- Filters by `filter.branches` set when non-empty

**Interactions**:
- `ScreenSpaceEventHandler` picks billboard by string `id` → lookup in local `Map<key, MilitaryBase>`
- Click opens `MilitaryBasePopup`

## Nuclear Sites Layer

**File**: `NuclearSitesLayer.tsx`

**Rendering** (Primitive collection):
- `BillboardCollection` for radiation-symbol canvas icons with `id` = `nuc::{name}::{country}`
- Type-based coloring via `TYPE_COLORS`: power (`#FBBF24`), weapons (red), enrichment (`#F97316`), reprocessing (`#A855F7`)
- `createRadiationCanvas()` generates 32×32 circles with dark inner core, cached per color
- `NearFarScalar(1e5, 1.5, 1e7, 0.4)` + `DistanceDisplayCondition(0, 3e7)`
- Billboard size 18×18 (slightly larger than military diamonds at 16×16)
- Filters by `filter.types` set when non-empty

**Interactions**:
- `ScreenSpaceEventHandler` picks billboard by string `id` → lookup in local `Map<key, NuclearSite>`
- Click opens `NuclearSitePopup`

## METAR Layer

**Files**: `MetarLayer.tsx`, `MetarPopup.tsx`

**Rendering** (Primitive collection):
- `BillboardCollection` for station icons with `id` = station ICAO code
- Color-coded by flight category: **VFR** (green), **MVFR** (blue), **IFR** (red), **LIFR** (magenta)
- `NearFarScalar` + `DistanceDisplayCondition` (visible up to 8,000 km)
- Maximum 600 stations visible — `camera.changed` listener re-sorts by distance and caps

**Interactions**:
- `ScreenSpaceEventHandler` picks billboard by `id` → lookup in local `Map<id, MetarStation>`
- Popup shows temperature, wind, visibility, ceiling, raw METAR text

## Event Layer

**Files**: `EventLayer.tsx`, `EventPopup.tsx`

**Rendering** (Primitive collections):
- `BillboardCollection` for per-category SVG icons (wildfire flame, storm lightning, volcano, earthquake, flood, ice)
- `PointPrimitiveCollection` for glow effect — each event has a semi-transparent point behind its billboard
- `NearFarScalar` for distance-based scaling on both collections
- Local `Map<id, NaturalEvent>` for pick-based lookup

**Interactions**:
- `ScreenSpaceEventHandler` picks billboard by `id`
- Popup includes category badge, date, coordinates, and NASA source link

## City Labels Layer

**File**: `CityLabelsLayer.tsx`

**Rendering** (Primitive collections):
- `LabelCollection` for city names + `PointPrimitiveCollection` for dot markers
- 120+ world capital cities from static dataset — created once, never re-rendered
- Population-based visibility distance (larger cities visible from higher altitude)
- `DistanceDisplayCondition` and `NearFarScalar` on both labels and points
- `disableDepthTestDistance: POSITIVE_INFINITY` ensures labels render above terrain

## Performance Architecture

### Entity API vs. Primitive API

The rendering layer underwent a full migration from the CesiumJS **Entity API** to the **Primitive API**. This is the single largest performance optimization in the frontend.

| Aspect | Entity API (before) | Primitive API (after) |
|--------|--------------------|-----------------------|
| Draw calls | 1 per entity (N draw calls) | 1 per collection (~15 total) |
| CPU overhead | Property system evaluated per entity per frame | Zero per-object CPU cost |
| Memory | ~2 KB per entity (property bags, event listeners) | ~200 bytes per primitive |
| Frustum culling | Manual (`computeViewRectangle` + `Rectangle.contains`) | Automatic by collection |
| Update pattern | `entity.position = ...` triggers change tracking | `billboard.position = ...` direct write |

### Collection Assignment

Each layer uses the narrowest primitive type for its data:

| Layer | Primary Collection | Secondary | Entity API (retained) |
|-------|-------------------|-----------|----------------------|
| Aircraft | `BillboardCollection` | `LabelCollection` | Route polylines, tracking entity |
| Satellites | `BillboardCollection` | `LabelCollection` | Orbit polylines |
| Traffic | `PointPrimitiveCollection` | — | Road polylines (`clampToGround`) |
| Cameras | `BillboardCollection` | — | — |
| METAR | `BillboardCollection` | — | — |
| Events | `BillboardCollection` | `PointPrimitiveCollection` | — |
| City Labels | `LabelCollection` | `PointPrimitiveCollection` | — |
| Military Bases | `BillboardCollection` | — | — |
| Nuclear Sites | `BillboardCollection` | — | — |
| Weather radar | — | — | `ImageryLayer` (tile-based, already optimal) |
| Temperature | — | — | `ImageryLayer` (OWM tiles or single-tile heatmap) |
| Wind particles | — | — | Canvas 2D (off-globe rendering) |

Entity API is only retained where CesiumJS requires it: `clampToGround` polylines and `viewer.trackedEntity` camera lock.

### Interaction Pattern (Picking)

All collections use a string `id` on each primitive. `scene.pick()` returns the picked object with its `id`, which maps to a local `Map` holding the full data object:

```
scene.pick(screenPosition)
  → picked.id (string: ICAO hex, NORAD id, camera UUID, etc.)
  → localMap.get(id) → full data object
  → callback (onSelect, onHover)
```

### Per-Frame Optimization Techniques

| Technique | Where Used | Impact |
|-----------|-----------|--------|
| `BillboardCollection` / `LabelCollection` | 8 layers | ~500x fewer draw calls |
| `PointPrimitiveCollection` | Traffic particles, events, cities | Direct position writes per frame |
| Precomputed IDW wind grid | `WindParticleLayer` | O(1) lookup vs. O(N) per particle/frame |
| Module-level `NearFarScalar` constants | All layers | Zero GC allocation per render |
| Progressive chunk rendering | Satellites | Visible data 2-5s sooner |
| `collection.show = false` | Traffic, weather | Zero-cost visibility toggle |
| `camera.changed` listener | METAR | Re-sort and cap on camera move only |
| `disableDepthTestDistance` | City labels | Always-visible labels without z-fighting |
| Globe occlusion (`Occluder`) | Wind particles | Skip far-side particles |
| Altitude gating | Traffic, METAR | Hide layer entirely above threshold |

### Memory & Draw Call Budget

| Scenario | Draw Calls | GPU Memory | FPS (M1 MacBook) |
|----------|-----------|------------|-------------------|
| 5,000 aircraft + 10,000 satellites (before) | ~15,000 | ~120 MB | 8-15 FPS |
| 5,000 aircraft + 10,000 satellites (after) | ~15 | ~30 MB | 55-60 FPS |
| All layers active (before) | ~20,000+ | ~180 MB | 5-10 FPS |
| All layers active (after) | ~25 | ~50 MB | 45-55 FPS |
