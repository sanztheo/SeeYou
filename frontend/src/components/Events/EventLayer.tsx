import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  PointPrimitiveCollection,
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

const EVT_BB_SCALE = new NearFarScalar(5_000, 1.2, 8_000_000, 0.3);
const EVT_GLOW_SCALE = new NearFarScalar(5_000, 1.2, 8_000_000, 0.4);

interface EventEntry {
  billboard: ReturnType<BillboardCollection["add"]>;
  glow: ReturnType<PointPrimitiveCollection["add"]>;
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
  const bbCollRef = useRef<BillboardCollection | null>(null);
  const pointCollRef = useRef<PointPrimitiveCollection | null>(null);
  const entryMapRef = useRef(new Map<string, EventEntry>());
  const eventMapRef = useRef(new Map<string, NaturalEvent>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!viewer) return;

    const bbColl = viewer.scene.primitives.add(
      new BillboardCollection({ scene: viewer.scene }),
    ) as BillboardCollection;
    const pointColl = viewer.scene.primitives.add(
      new PointPrimitiveCollection(),
    ) as PointPrimitiveCollection;
    bbCollRef.current = bbColl;
    pointCollRef.current = pointColl;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && typeof picked.id === "string") {
        const evt = eventMapRef.current.get(picked.id);
        if (evt) onSelectRef.current?.(evt);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      entryMapRef.current.clear();
      eventMapRef.current.clear();
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(bbColl);
        viewer.scene.primitives.remove(pointColl);
      }
      bbCollRef.current = null;
      pointCollRef.current = null;
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
    const bbColl = bbCollRef.current;
    const pointColl = pointCollRef.current;
    if (!bbColl || !pointColl || !viewer) return;

    const visible = getVisibleEvents();
    const visibleIds = new Set(visible.map((e) => e.id));
    const entries = entryMapRef.current;

    const toDelete: string[] = [];
    for (const id of entries.keys()) {
      if (!visibleIds.has(id)) toDelete.push(id);
    }
    for (const id of toDelete) {
      const entry = entries.get(id)!;
      bbColl.remove(entry.billboard);
      pointColl.remove(entry.glow);
      entries.delete(id);
    }

    const nextMap = new Map<string, NaturalEvent>();
    for (const evt of visible) {
      nextMap.set(evt.id, evt);
      if (!entries.has(evt.id)) {
        const hex =
          EVENT_CATEGORY_COLORS[evt.category] ?? EVENT_CATEGORY_COLORS.Other;
        const glowColor = Color.fromCssColorString(hex).withAlpha(0.3);
        const pos = Cartesian3.fromDegrees(evt.lon, evt.lat);

        const glow = pointColl.add({
          position: pos,
          pixelSize: 22,
          color: glowColor,
          scaleByDistance: EVT_GLOW_SCALE,
          id: evt.id,
        });

        const billboard = bbColl.add({
          position: pos,
          image: getEventIcon(evt.category),
          width: 28,
          height: 28,
          scaleByDistance: EVT_BB_SCALE,
          id: evt.id,
        });

        entries.set(evt.id, { billboard, glow });
      }
    }

    eventMapRef.current = nextMap;
  }, [events, filter, viewer, getVisibleEvents]);

  return null;
}
