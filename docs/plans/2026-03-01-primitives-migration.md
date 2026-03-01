# Primitives Migration — Performance Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all CesiumJS layers from Entity API to Primitive API for 10-50x FPS improvement.

**Architecture:** Replace every `CustomDataSource` + `entities.add()` with GPU-batched collections (`BillboardCollection`, `PointPrimitiveCollection`, `PolylineCollection`, `LabelCollection`). Keep all data pipelines (WebSocket, stores, services) untouched. Each layer is migrated independently — pick order allows continuous testing.

**Tech Stack:** CesiumJS Primitives (`BillboardCollection`, `PointPrimitiveCollection`, `PolylineCollection`, `LabelCollection`), same React hooks, same Resium `useCesium`.

---

## Overview

### What changes
- Rendering code in ~8 layer components
- Entity-based pick → manual scene.pick with collection-level lookup

### What does NOT change
- WebSocket pipeline, stores, services, types
- Sidebar controls, filters, popups
- `useAppState`, `useWebSocket`, `useAircraftStore`, `useSatelliteStore`
- Shader system, HUDs, minimap, timeline, search

### Priority order (by FPS impact)
1. Aircraft (5000 entities → 1 BillboardCollection)
2. Traffic Particles (2000 entities updated/frame → 1 PointPrimitiveCollection)
3. Satellites (thousands of entities → 1 BillboardCollection)
4. Traffic Roads (hundreds of polyline entities → 1 PolylineCollection)
5. METAR (600 entities → 1 BillboardCollection)
6. Wind Particles (optimize IDW grid lookup)
7. Cameras (<100 entities → 1 BillboardCollection)
8. Events (<100 entities → 1 BillboardCollection + 1 PointPrimitiveCollection)
9. City Labels (~200 entities → 1 LabelCollection + 1 PointPrimitiveCollection)

---

## Task 1: Aircraft — Entity → BillboardCollection

**Files:**
- Rewrite: `frontend/src/components/Aircraft/AircraftBillboards.tsx`
- Rewrite: `frontend/src/components/Aircraft/aircraftUtils.ts` (remove Entity-based culling)
- Modify: `frontend/src/components/Aircraft/AircraftLayer.tsx` (collections instead of DataSource)
- Modify: `frontend/src/components/Aircraft/AircraftInteractions.ts` (pick from collection)

### Key concepts

`BillboardCollection` batches all billboards into a single GPU draw call. Instead of creating `Entity` objects with property tracking, you create lightweight `Billboard` objects that are just position + image + color.

Dead-reckoning interpolation via `SampledPositionProperty` is replaced by manual position updates — compute the predicted position once when data arrives, set it directly on the billboard.

Culling is automatic via CesiumJS frustum culling on BillboardCollection — no need for manual `cullEntities()`.

### Step 1: Rewrite AircraftBillboards.tsx

Replace the hook to manage a `BillboardCollection` and a `LabelCollection` instead of Entity operations.

```typescript
// frontend/src/components/Aircraft/AircraftBillboards.tsx
import { useEffect, useRef } from "react";
import {
  BillboardCollection,
  LabelCollection,
  Cartesian3,
  Cartesian2,
  Color,
  NearFarScalar,
  VerticalOrigin,
  HorizontalOrigin,
  Math as CesiumMath,
  type Viewer,
  type Billboard,
  type Label,
} from "cesium";
import type { AircraftPosition, AircraftFilter } from "../../types/aircraft";
import { CIVIL_ICON, MIL_ICON, filterVisibleAircraft } from "./aircraftUtils";

const CIVILIAN_COLOR = Color.fromCssColorString("#3B82F6");
const MILITARY_COLOR = Color.fromCssColorString("#EF4444");
const LABEL_SCALE_NEAR = new NearFarScalar(1_000, 1.0, 500_000, 0.0);
const BILLBOARD_SCALE = new NearFarScalar(5_000, 1.2, 2_000_000, 0.3);

interface BillboardEntry {
  billboard: Billboard;
  label: Label;
}

export function useAircraftBillboards(
  viewerRef: { current: Viewer | null },
  aircraft: Map<string, AircraftPosition>,
  filter: AircraftFilter,
  trackedIcaoRef: { current: string | null },
): { current: BillboardCollection | null } {
  const bbCollRef = useRef<BillboardCollection | null>(null);
  const lblCollRef = useRef<LabelCollection | null>(null);
  const entryMapRef = useRef<Map<string, BillboardEntry>>(new Map());
  const collRef = useRef<BillboardCollection | null>(null);

  // Mount collections
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const bbColl = viewer.scene.primitives.add(new BillboardCollection({ scene: viewer.scene }));
    const lblColl = viewer.scene.primitives.add(new LabelCollection({ scene: viewer.scene }));
    bbCollRef.current = bbColl;
    lblCollRef.current = lblColl;
    collRef.current = bbColl;

    return () => {
      entryMapRef.current.clear();
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(bbColl);
        viewer.scene.primitives.remove(lblColl);
      }
      bbCollRef.current = null;
      lblCollRef.current = null;
      collRef.current = null;
    };
  }, [viewerRef]);

  // Sync aircraft data → billboards
  useEffect(() => {
    const bbColl = bbCollRef.current;
    const lblColl = lblCollRef.current;
    if (!bbColl || !lblColl) return;

    const visible = filterVisibleAircraft(aircraft, filter);
    const entries = entryMapRef.current;
    const trackedIcao = trackedIcaoRef.current;

    // Remove departed
    const toDelete: string[] = [];
    for (const [icao] of entries) {
      if (!visible.has(icao)) toDelete.push(icao);
    }
    for (const icao of toDelete) {
      const entry = entries.get(icao)!;
      bbColl.remove(entry.billboard);
      lblColl.remove(entry.label);
      entries.delete(icao);
    }

    // Add or update
    for (const [icao, ac] of visible) {
      const pos = Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude_m);
      const color = ac.is_military ? MILITARY_COLOR : CIVILIAN_COLOR;
      const icon = ac.is_military ? MIL_ICON : CIVIL_ICON;
      const rotation = -CesiumMath.toRadians(ac.heading);

      const existing = entries.get(icao);
      if (existing) {
        existing.billboard.position = pos;
        existing.billboard.image = icon;
        existing.billboard.color = color;
        existing.billboard.rotation = rotation;
        existing.label.position = pos;
        existing.label.text = ac.callsign ?? ac.icao;
      } else {
        const billboard = bbColl.add({
          position: pos,
          image: icon,
          width: 24,
          height: 24,
          color,
          rotation,
          alignedAxis: Cartesian3.UNIT_Z,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: BILLBOARD_SCALE,
          id: icao,
        });
        const label = lblColl.add({
          position: pos,
          text: ac.callsign ?? ac.icao,
          font: "12px monospace",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          verticalOrigin: VerticalOrigin.TOP,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian2(14, 4),
          scaleByDistance: LABEL_SCALE_NEAR,
          id: icao,
        });
        entries.set(icao, { billboard, label });
      }
    }
  }, [aircraft, filter, trackedIcaoRef]);

  return collRef;
}
```

### Step 2: Update AircraftLayer.tsx

Remove `CustomDataSource` setup. Use scene primitives directly. Update interaction handler to use `scene.pick` which returns Billboard objects with `.id`.

### Step 3: Update AircraftInteractions.ts

When picking, `scene.pick` returns a `Billboard` (or `Label`) with an `.id` field set to the icao. Look up the aircraft from the Map using that id.

### Step 4: Remove cullEntities from aircraftUtils.ts

`BillboardCollection` does frustum culling automatically. Delete the `cullEntities` function and the camera.changed listener. Keep `filterVisibleAircraft`, `computeEntityDiff` (useful for tests), `predictPosition`, the SVG builders, and route/prediction utilities.

### Step 5: Verify & commit

Run: `cd frontend && npm run build && npm run lint`
Test: Enable aircraft layer, zoom in/out, click aircraft, verify popup works, verify filter toggle, verify tracking.

---

## Task 2: Traffic Particles — Entity → PointPrimitiveCollection

**Files:**
- Rewrite: `frontend/src/components/Traffic/ParticleEngine.ts`
- Modify: `frontend/src/components/Traffic/TrafficLayer.tsx`

### Key change

The current ParticleEngine does `entities.getById(id)` + `position.setValue()` for 2000 particles **every single frame**. This is the single worst offender — Entity property updates trigger internal event processing.

Replace with `PointPrimitiveCollection`. Each point has a `.position` you can set directly with zero overhead.

```typescript
// ParticleEngine.ts — core change
import { PointPrimitiveCollection, Cartesian3, Color, NearFarScalar } from "cesium";

export class ParticleEngine {
  private collection: PointPrimitiveCollection;
  private particles: Particle[] = [];
  private scratch = new Cartesian3();

  constructor(collection: PointPrimitiveCollection) {
    this.collection = collection;
  }

  updateRoads(roads: Road[], hour: number): void {
    this.clear();
    // ... same particle generation logic ...
    // Instead of ds.entities.add:
    const point = this.collection.add({
      position: Cartesian3.fromDegrees(pos.lon, pos.lat),
      pixelSize: 3,
      color,
      scaleByDistance: new NearFarScalar(1_000, 1.2, 50_000, 0.3),
    });
    this.particles.push({ point, progress, speed, total, segments, nodes });
  }

  tick(dt: number): void {
    for (const p of this.particles) {
      p.progress += p.speed * dt;
      if (p.progress >= p.total) p.progress -= p.total;
      const pos = lerp(p.nodes, p.segments, p.progress);
      Cartesian3.fromDegrees(pos.lon, pos.lat, 0, undefined, this.scratch);
      p.point.position = this.scratch; // Direct GPU buffer update, no event system
    }
  }
}
```

### TrafficLayer changes

- Replace `CustomDataSource("traffic-particles")` with `new PointPrimitiveCollection()`
- Add to `scene.primitives` instead of `dataSources`
- Road polylines: replace `CustomDataSource("traffic-roads")` with `PolylineCollection` (or `GroundPolylinePrimitive` for clampToGround)

---

## Task 3: Satellites — Entity → BillboardCollection

**Files:**
- Rewrite: `frontend/src/components/Satellite/SatelliteLayer.tsx`

Same pattern as Aircraft. Replace `CustomDataSource` with `BillboardCollection` + `LabelCollection`. Maintain satellite icon cache (already efficient). Replace `ScreenSpaceEventHandler` pick to check `Billboard.id`.

Remove the manual `cullEntities` function — BillboardCollection handles frustum culling.

---

## Task 4: Traffic Roads — Entity polyline → GroundPolylinePrimitive

**Files:**
- Modify: `frontend/src/components/Traffic/TrafficLayer.tsx`

Replace Entity polylines with `GroundPolylinePrimitive` + `GeometryInstance` batching. All road polylines of the same type can share a single `Appearance`, reducing draw calls.

For roads with `clampToGround`, use:
```typescript
import { GroundPolylinePrimitive, GroundPolylineGeometry, GeometryInstance } from "cesium";

const instances = roads.map(road => new GeometryInstance({
  geometry: new GroundPolylineGeometry({
    positions: Cartesian3.fromDegreesArray(road.nodes.flatMap(n => [n.lon, n.lat])),
    width: ROAD_WIDTH[road.road_type],
  }),
  id: road.id,
  attributes: { color: ColorGeometryInstanceAttribute.fromColor(ROAD_COLOR[road.road_type]) },
}));

scene.primitives.add(new GroundPolylinePrimitive({
  geometryInstances: instances,
  appearance: new PolylineMaterialAppearance({ ... }),
}));
```

This batches ALL road polylines into 1 draw call (grouped by appearance).

---

## Task 5: METAR — Entity → BillboardCollection

**Files:**
- Rewrite: `frontend/src/components/Aviation/MetarLayer.tsx`

Same pattern as Aircraft/Satellites. 600 METAR stations → 1 BillboardCollection. Keep the distance-based sorting logic (`approxDistSq`, `MAX_VISIBLE=600`). Remove manual camera.changed culling.

---

## Task 6: Wind Particles — Optimize IDW grid lookup

**Files:**
- Modify: `frontend/src/components/Weather/WindParticleLayer.tsx`

Current: For each of 4000 particles, iterate ALL weather points for IDW interpolation → O(4000 × N) per frame.

Optimization: Precompute a wind grid (e.g., 1° resolution) when weather data arrives. During animation, each particle does a single grid lookup instead of iterating all points.

```typescript
// Precompute grid when points change
const GRID_RES = 1; // 1 degree
const grid = new Map<string, { u: number; v: number }>();
for (let lat = -85; lat <= 85; lat += GRID_RES) {
  for (let lon = -180; lon <= 180; lon += GRID_RES) {
    grid.set(`${lat},${lon}`, idw(points, lon, lat));
  }
}

// In animation loop: O(1) lookup instead of O(N)
function gridLookup(lon: number, lat: number) {
  const gLat = Math.round(lat / GRID_RES) * GRID_RES;
  const gLon = Math.round(lon / GRID_RES) * GRID_RES;
  return grid.get(`${gLat},${gLon}`) ?? { u: 0, v: 0 };
}
```

---

## Task 7: Cameras — Entity → BillboardCollection

**Files:**
- Rewrite: `frontend/src/components/Camera/CameraLayer.tsx`

Small number of entities but still worth migrating for consistency. Same BillboardCollection pattern. Keep the ScreenSpaceEventHandler pick approach.

---

## Task 8: Events — Entity → BillboardCollection + PointPrimitiveCollection

**Files:**
- Rewrite: `frontend/src/components/Events/EventLayer.tsx`

Currently creates 2 entities per event (glow point + icon billboard). Replace with a `PointPrimitiveCollection` for glows and a `BillboardCollection` for icons. Both are 1 draw call each.

---

## Task 9: City Labels — Entity → LabelCollection + PointPrimitiveCollection

**Files:**
- Rewrite: `frontend/src/components/City/CityLabelsLayer.tsx`

Static data (~200 capitals). Replace with `LabelCollection` + `PointPrimitiveCollection`. Created once, never updated.

---

## Expected results

| Metric | Before (Entity API) | After (Primitives) |
|---|---|---|
| GPU draw calls (all layers) | ~8000+ | ~15-20 |
| CPU per frame (entity eval) | O(n) per entity | Near zero |
| FPS with all layers on | ~10-20 | **50-60** |
| Memory (entity overhead) | ~15-20 MB | ~2-3 MB |
| Traffic particles update | 2000 entity lookups/frame | Direct buffer writes |
| Wind IDW computation | O(4000 × N) / frame | O(4000) / frame |

---

## Notes

- **Weather Radar (WeatherLayer.tsx):** Already uses `ImageryLayer` tiles — efficient, no change needed.
- **Shaders (ShaderManager):** Post-processing pipeline is independent of entity/primitive choice — no change needed.
- **Picking:** `scene.pick()` works identically for both Entity and Primitive objects. The picked object has an `.id` property set at creation time. The only change is the lookup: instead of `(picked.id as Entity).id`, use `picked.primitive.id` or the `id` set on the Billboard/Point directly.
- **Tests:** Existing tests for `filterVisibleAircraft`, `computeEntityDiff` remain valid — they're pure functions with no Cesium dependency.
