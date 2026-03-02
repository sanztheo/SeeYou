import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { GdeltEvent, GdeltFilter } from "../../types/gdelt";

interface Props {
  events: GdeltEvent[];
  filter: GdeltFilter;
  onSelect?: (event: GdeltEvent) => void;
}

function toneColor(tone: number): Color {
  if (tone < -5) return Color.RED.withAlpha(0.8);
  if (tone < -2) return Color.ORANGERED.withAlpha(0.7);
  if (tone < 0) return Color.ORANGE.withAlpha(0.6);
  if (tone < 2) return Color.YELLOW.withAlpha(0.5);
  if (tone < 5) return Color.LIME.withAlpha(0.6);
  return Color.GREEN.withAlpha(0.7);
}

function gdeltKey(evt: GdeltEvent): string {
  return `${evt.lat}:${evt.lon}:${evt.url}`;
}

const GDELT_SCALE = new NearFarScalar(1e5, 1.5, 1e7, 0.4);
const GDELT_DDC = new DistanceDisplayCondition(0, 3e7);

export function GdeltLayer({ events, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, GdeltEvent>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const handler = new ScreenSpaceEventHandler(
      scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = scene.pick(click.position);
      if (defined(picked) && typeof picked.id === "string") {
        const evt = dataMapRef.current.get(picked.id);
        if (evt) onSelectRef.current?.(evt);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const points = new PointPrimitiveCollection();
    const map = new Map<string, GdeltEvent>();

    if (filter.enabled) {
      for (const evt of events) {
        const key = gdeltKey(evt);
        map.set(key, evt);
        points.add({
          position: Cartesian3.fromDegrees(evt.lon, evt.lat),
          pixelSize: 6,
          color: toneColor(evt.tone),
          scaleByDistance: GDELT_SCALE,
          distanceDisplayCondition: GDELT_DDC,
          id: key,
        });
      }
    }

    scene.primitives.add(points);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(points);
    };
  }, [scene, events, filter.enabled]);

  return null;
}
