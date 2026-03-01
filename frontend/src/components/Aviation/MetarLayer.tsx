import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Entity,
  Cartesian3,
  Color,
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

const CATEGORY_CESIUM_COLORS: Record<FlightCategory, Color> = {
  VFR: Color.fromCssColorString(FLIGHT_CATEGORY_COLORS.VFR),
  MVFR: Color.fromCssColorString(FLIGHT_CATEGORY_COLORS.MVFR),
  IFR: Color.fromCssColorString(FLIGHT_CATEGORY_COLORS.IFR),
  LIFR: Color.fromCssColorString(FLIGHT_CATEGORY_COLORS.LIFR),
};

function categoryColor(cat: string): Color {
  return CATEGORY_CESIUM_COLORS[cat as FlightCategory] ?? Color.GRAY;
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
        if (existing.point) {
          existing.point.color = categoryColor(s.flight_category) as never;
        }
      } else {
        ds.entities.add({
          id: s.station_id,
          position: Cartesian3.fromDegrees(s.lon, s.lat),
          point: {
            pixelSize: 6,
            color: categoryColor(s.flight_category),
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            scaleByDistance: new NearFarScalar(100_000, 1.2, 10_000_000, 0.3),
            distanceDisplayCondition: new DistanceDisplayCondition(
              0,
              8_000_000,
            ),
          },
        });
      }
    }

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
