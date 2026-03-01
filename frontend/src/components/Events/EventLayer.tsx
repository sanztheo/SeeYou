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
import type { NaturalEvent, EventFilter } from "../../types/events";
import { EVENT_CATEGORY_COLORS } from "../../types/events";

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
        const evt = eventMapRef.current.get(picked.id.id);
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

    for (const id of existingIds) {
      if (!visibleIds.has(id)) ds.entities.removeById(id);
    }

    const nextMap = new Map<string, NaturalEvent>();
    for (const evt of visible) {
      nextMap.set(evt.id, evt);
      if (!ds.entities.getById(evt.id)) {
        const hex =
          EVENT_CATEGORY_COLORS[evt.category] ?? EVENT_CATEGORY_COLORS.Other;
        const baseColor = Color.fromCssColorString(hex);
        const glowColor = baseColor.withAlpha(0.3);

        ds.entities.add(
          new Entity({
            id: evt.id,
            position: Cartesian3.fromDegrees(evt.lon, evt.lat),
            point: {
              pixelSize: 10,
              color: baseColor,
              outlineColor: Color.BLACK,
              outlineWidth: 1,
              scaleByDistance: new NearFarScalar(5_000, 1.2, 8_000_000, 0.4),
            },
          }),
        );

        ds.entities.add(
          new Entity({
            id: `${evt.id}_glow`,
            position: Cartesian3.fromDegrees(evt.lon, evt.lat),
            point: {
              pixelSize: 20,
              color: glowColor,
              outlineWidth: 0,
              scaleByDistance: new NearFarScalar(5_000, 1.2, 8_000_000, 0.4),
            },
          }),
        );
      }
    }

    eventMapRef.current = nextMap;
  }, [events, filter, viewer, getVisibleEvents]);

  return null;
}
