import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Entity,
  Cartesian3,
  Color,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type {
  NaturalEvent,
  EventCategory,
  EventFilter,
} from "../../types/events";
import { EVENT_CATEGORY_COLORS } from "../../types/events";

const EVENT_SVG_PATHS: Record<EventCategory, string> = {
  Wildfires:
    "M16 2c-1 4-4 6-4 10a4 4 0 0 0 8 0c0-4-3-6-4-10zm-2 18c-1-3-3-4-3-7a3 3 0 0 0 6 0c0 3-2 4-3 7z",
  SevereStorms: "M13 2L4 14h7l-2 16 13-18h-8l5-10z",
  Volcanoes: "M16 4l-3 8H6l-2 6h4l-4 10h24l-4-10h4l-2-6h-7l-3-8zm-6 14h12",
  Earthquakes: "M2 16h4l2-6 3 12 3-14 3 10 2-4 3 8h6",
  Floods:
    "M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0M2 22c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0",
  SeaAndLakeIce:
    "M16 2v28M2 16h28M6 6l20 20M26 6L6 26M16 6l-3 4 3 2 3-2-3-4zM16 26l-3-4 3-2 3 2-3 4zM6 16l4-3 2 3-2 3-4-3zM26 16l-4-3-2 3 2 3 4-3z",
  Other: "M16 3L2 28h28L16 3zm0 7v8m0 4v2",
};

const iconCache = new Map<EventCategory, string>();

function getEventIcon(category: EventCategory): string {
  const cached = iconCache.get(category);
  if (cached) return cached;

  const color = EVENT_CATEGORY_COLORS[category] ?? EVENT_CATEGORY_COLORS.Other;
  const path = EVENT_SVG_PATHS[category] ?? EVENT_SVG_PATHS.Other;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="${path}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill-opacity="0.9"/></svg>`;
  const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
  iconCache.set(category, uri);
  return uri;
}

interface EventLayerProps {
  events: NaturalEvent[];
  filter: EventFilter;
  onSelect?: (event: NaturalEvent) => void;
}

export function EventLayer({
  events,
  filter,
  onSelect,
}: EventLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);
  const eventMapRef = useRef<Map<string, NaturalEvent>>(new Map());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!viewer) return;

    const ds = new CustomDataSource("events");
    viewer.dataSources.add(ds);
    dsRef.current = ds;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id instanceof Entity) {
        const id = picked.id.id;
        const baseId = id.endsWith("_glow") ? id.slice(0, -5) : id;
        const evt = eventMapRef.current.get(baseId);
        if (evt) onSelectRef.current?.(evt);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
      }
      dsRef.current = null;
    };
  }, [viewer]);

  const getVisibleEvents = useCallback((): NaturalEvent[] => {
    if (!filter.enabled) return [];
    const hasCatFilter = filter.categories.size > 0;
    return events.filter(
      (e) => !hasCatFilter || filter.categories.has(e.category),
    );
  }, [events, filter]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds || !viewer) return;

    const visible = getVisibleEvents();
    const visibleIds = new Set<string>();
    for (const e of visible) {
      visibleIds.add(e.id);
      visibleIds.add(`${e.id}_glow`);
    }

    const existingIds = new Set<string>();
    for (let i = 0; i < ds.entities.values.length; i++) {
      existingIds.add(ds.entities.values[i].id);
    }

    ds.entities.suspendEvents();

    for (const id of existingIds) {
      if (!visibleIds.has(id)) ds.entities.removeById(id);
    }

    const nextMap = new Map<string, NaturalEvent>();
    for (const evt of visible) {
      nextMap.set(evt.id, evt);
      if (!ds.entities.getById(evt.id)) {
        const hex =
          EVENT_CATEGORY_COLORS[evt.category] ?? EVENT_CATEGORY_COLORS.Other;
        const glowColor = Color.fromCssColorString(hex).withAlpha(0.3);

        ds.entities.add(
          new Entity({
            id: `${evt.id}_glow`,
            position: Cartesian3.fromDegrees(evt.lon, evt.lat),
            point: {
              pixelSize: 22,
              color: glowColor,
              outlineWidth: 0,
              scaleByDistance: new NearFarScalar(5_000, 1.2, 8_000_000, 0.4),
            },
          }),
        );

        ds.entities.add(
          new Entity({
            id: evt.id,
            position: Cartesian3.fromDegrees(evt.lon, evt.lat),
            billboard: {
              image: getEventIcon(evt.category),
              width: 28,
              height: 28,
              scaleByDistance: new NearFarScalar(5_000, 1.2, 8_000_000, 0.3),
            },
          }),
        );
      }
    }

    ds.entities.resumeEvents();
    eventMapRef.current = nextMap;
  }, [events, filter, viewer, getVisibleEvents]);

  return null;
}
