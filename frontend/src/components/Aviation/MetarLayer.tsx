import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Entity,
  Cartesian3,
  NearFarScalar,
  DistanceDisplayCondition,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CesiumMath,
  defined,
} from "cesium";
import type {
  MetarStation,
  MetarFilter,
  FlightCategory,
} from "../../types/metar";
import { FLIGHT_CATEGORY_COLORS } from "../../types/metar";

const MAX_VISIBLE = 600;
const CAMERA_THROTTLE_MS = 250;

function makeCategorySvg(category: FlightCategory): string {
  const fill = FLIGHT_CATEGORY_COLORS[category];
  switch (category) {
    case "VFR":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
        `<circle cx="16" cy="16" r="6" fill="${fill}"/>` +
        `<g stroke="${fill}" stroke-width="2" stroke-linecap="round">` +
        `<line x1="16" y1="2" x2="16" y2="7"/>` +
        `<line x1="16" y1="25" x2="16" y2="30"/>` +
        `<line x1="2" y1="16" x2="7" y2="16"/>` +
        `<line x1="25" y1="16" x2="30" y2="16"/>` +
        `<line x1="6.1" y1="6.1" x2="9.6" y2="9.6"/>` +
        `<line x1="22.4" y1="22.4" x2="25.9" y2="25.9"/>` +
        `<line x1="6.1" y1="25.9" x2="9.6" y2="22.4"/>` +
        `<line x1="22.4" y1="9.6" x2="25.9" y2="6.1"/>` +
        `</g></svg>`
      );
    case "MVFR":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
        `<circle cx="12" cy="12" r="5" fill="${fill}"/>` +
        `<g stroke="${fill}" stroke-width="1.5" stroke-linecap="round">` +
        `<line x1="12" y1="2" x2="12" y2="5"/>` +
        `<line x1="4" y1="6" x2="6.5" y2="7.8"/>` +
        `<line x1="2" y1="12" x2="5" y2="12"/>` +
        `<line x1="4" y1="18" x2="6.5" y2="16.2"/>` +
        `</g>` +
        `<path d="M14 18 a5 5 0 0 1 5-5 h2 a4 4 0 0 1 4 4 v1 a3 3 0 0 1-3 3 H16 a3 3 0 0 1-2-5z" fill="${fill}"/>` +
        `<ellipse cx="18" cy="19" rx="8" ry="4" fill="${fill}" opacity="0.7"/>` +
        `</svg>`
      );
    case "IFR":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
        `<path d="M8 14 a6 6 0 0 1 6-6 h1 a5 5 0 0 1 5 5 v1 a4 4 0 0 1-4 4 H10 a4 4 0 0 1-2-4z" fill="${fill}"/>` +
        `<ellipse cx="15" cy="15" rx="10" ry="5" fill="${fill}" opacity="0.8"/>` +
        `<g stroke="${fill}" stroke-width="2" stroke-linecap="round" opacity="0.6">` +
        `<line x1="8" y1="22" x2="24" y2="22"/>` +
        `<line x1="6" y1="26" x2="26" y2="26"/>` +
        `</g></svg>`
      );
    case "LIFR":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
        `<path d="M6 15 a7 7 0 0 1 7-7 h2 a6 6 0 0 1 6 6 v1 a4 4 0 0 1-4 4 H9 a4 4 0 0 1-3-4z" fill="${fill}"/>` +
        `<ellipse cx="14" cy="16" rx="11" ry="5" fill="${fill}" opacity="0.8"/>` +
        `<polygon points="19,17 17,23 19,21 20,27 22,20 20,22" fill="${fill}"/>` +
        `</svg>`
      );
  }
}

const categoryIconCache = new Map<string, string>();

function getCategoryIcon(category: string): string {
  const cached = categoryIconCache.get(category);
  if (cached) return cached;
  const cat = category as FlightCategory;
  const svg = makeCategorySvg(cat);
  const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
  categoryIconCache.set(category, uri);
  return uri;
}

function approxDistSq(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = lat2 - lat1;
  const cosAvg = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
  const dLon = (lon2 - lon1) * cosAvg;
  return dLat * dLat + dLon * dLon;
}

interface MetarLayerProps {
  stations: MetarStation[];
  filter: MetarFilter;
  onSelect?: (station: MetarStation) => void;
}

export function MetarLayer({
  stations,
  filter,
  onSelect,
}: MetarLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);
  const stationMapRef = useRef<Map<string, MetarStation>>(new Map());
  const onSelectRef = useRef(onSelect);
  const stationsRef = useRef(stations);
  const filterRef = useRef(filter);
  const lastSyncRef = useRef(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const syncEntities = useCallback(() => {
    const ds = dsRef.current;
    if (!ds || !viewer || viewer.isDestroyed()) return;

    const now = performance.now();
    if (now - lastSyncRef.current < CAMERA_THROTTLE_MS) return;
    lastSyncRef.current = now;

    const f = filterRef.current;
    const all = stationsRef.current;
    const hasCatFilter = f.categories.size > 0;
    const filtered = hasCatFilter
      ? all.filter((s) => f.categories.has(s.flight_category as FlightCategory))
      : all;

    let visible: MetarStation[];
    if (filtered.length <= MAX_VISIBLE) {
      visible = filtered;
    } else {
      const camPos = viewer.camera.positionCartographic;
      const camLat = CesiumMath.toDegrees(camPos.latitude);
      const camLon = CesiumMath.toDegrees(camPos.longitude);

      const scored = filtered.map((s) => ({
        s,
        d: approxDistSq(camLat, camLon, s.lat, s.lon),
      }));
      scored.sort((a, b) => a.d - b.d);
      visible = scored.slice(0, MAX_VISIBLE).map((x) => x.s);
    }

    const visibleIds = new Set(visible.map((s) => s.station_id));

    ds.entities.suspendEvents();

    const toRemove: string[] = [];
    for (let i = 0; i < ds.entities.values.length; i++) {
      const id = ds.entities.values[i].id;
      if (!visibleIds.has(id)) toRemove.push(id);
    }
    for (const id of toRemove) {
      ds.entities.removeById(id);
    }

    const nextMap = new Map<string, MetarStation>();
    for (const s of visible) {
      nextMap.set(s.station_id, s);
      const existing = ds.entities.getById(s.station_id);
      if (existing) {
        if (existing.billboard) {
          existing.billboard.image = getCategoryIcon(
            s.flight_category,
          ) as never;
        }
      } else {
        ds.entities.add({
          id: s.station_id,
          position: Cartesian3.fromDegrees(s.lon, s.lat),
          billboard: {
            image: getCategoryIcon(s.flight_category),
            width: 24,
            height: 24,
            scaleByDistance: new NearFarScalar(100_000, 1.0, 10_000_000, 0.15),
            distanceDisplayCondition: new DistanceDisplayCondition(
              0,
              8_000_000,
            ),
          },
        });
      }
    }

    ds.entities.resumeEvents();
    stationMapRef.current = nextMap;
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;

    const ds = new CustomDataSource("metar");
    viewer.dataSources.add(ds);
    dsRef.current = ds;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id instanceof Entity) {
        const station = stationMapRef.current.get(picked.id.id);
        if (station) onSelectRef.current?.(station);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.changed.addEventListener(syncEntities);

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(syncEntities);
        viewer.dataSources.remove(ds, true);
      }
      handler.destroy();
      dsRef.current = null;
    };
  }, [viewer, syncEntities]);

  useEffect(() => {
    stationsRef.current = stations;
    filterRef.current = filter;
    lastSyncRef.current = 0;
    syncEntities();
  }, [stations, filter, syncEntities]);

  return null;
}
