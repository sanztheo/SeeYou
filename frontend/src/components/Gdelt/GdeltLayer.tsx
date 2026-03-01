import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
} from "cesium";
import type { GdeltEvent, GdeltFilter } from "../../types/gdelt";

interface Props {
  events: GdeltEvent[];
  filter: GdeltFilter;
}

function toneColor(tone: number): Color {
  if (tone < -5) return Color.RED.withAlpha(0.8);
  if (tone < -2) return Color.ORANGERED.withAlpha(0.7);
  if (tone < 0) return Color.ORANGE.withAlpha(0.6);
  if (tone < 2) return Color.YELLOW.withAlpha(0.5);
  if (tone < 5) return Color.LIME.withAlpha(0.6);
  return Color.GREEN.withAlpha(0.7);
}

export function GdeltLayer({ events, filter }: Props): null {
  const { scene } = useCesium();
  const collRef = useRef<PointPrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const points = new PointPrimitiveCollection();

    if (filter.enabled) {
      for (const evt of events) {
        points.add({
          position: Cartesian3.fromDegrees(evt.lon, evt.lat),
          pixelSize: 6,
          color: toneColor(evt.tone),
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e7),
        });
      }
    }

    scene.primitives.add(points);
    collRef.current = points;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(points);
    };
  }, [scene, events, filter.enabled]);

  return null;
}
