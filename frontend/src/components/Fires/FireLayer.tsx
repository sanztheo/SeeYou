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
import type { FireHotspot, FiresFilter } from "../../types/fires";

interface Props {
  fires: FireHotspot[];
  filter: FiresFilter;
  onSelect?: (fire: FireHotspot) => void;
}

function fireColor(frp: number): Color {
  if (frp >= 100) return Color.RED.withAlpha(0.9);
  if (frp >= 50) return Color.ORANGERED.withAlpha(0.85);
  if (frp >= 20) return Color.ORANGE.withAlpha(0.8);
  return Color.fromCssColorString("#FF6B35").withAlpha(0.7);
}

function fireKey(f: FireHotspot): string {
  return `${f.lat}:${f.lon}:${f.acq_date}`;
}

const FIRE_SCALE = new NearFarScalar(1e4, 2.0, 1e7, 0.3);
const FIRE_DDC = new DistanceDisplayCondition(0, 3e7);

export function FireLayer({ fires, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, FireHotspot>());
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
        const fire = dataMapRef.current.get(picked.id);
        if (fire) onSelectRef.current?.(fire);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const points = new PointPrimitiveCollection();
    const map = new Map<string, FireHotspot>();

    if (filter.enabled) {
      for (const f of fires) {
        if (filter.minConfidence === "high" && f.confidence !== "high")
          continue;
        const key = fireKey(f);
        map.set(key, f);
        points.add({
          position: Cartesian3.fromDegrees(f.lon, f.lat),
          pixelSize: Math.max(3, Math.min(f.frp / 10, 12)),
          color: fireColor(f.frp),
          scaleByDistance: FIRE_SCALE,
          distanceDisplayCondition: FIRE_DDC,
          id: key,
        });
      }
    }

    scene.primitives.add(points);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(points);
    };
  }, [scene, fires, filter.enabled, filter.minConfidence]);

  return null;
}
