import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
} from "cesium";
import type { FireHotspot, FiresFilter } from "../../types/fires";

interface Props {
  fires: FireHotspot[];
  filter: FiresFilter;
}

function fireColor(frp: number): Color {
  if (frp >= 100) return Color.RED.withAlpha(0.9);
  if (frp >= 50) return Color.ORANGERED.withAlpha(0.85);
  if (frp >= 20) return Color.ORANGE.withAlpha(0.8);
  return Color.fromCssColorString("#FF6B35").withAlpha(0.7);
}

export function FireLayer({ fires, filter }: Props): null {
  const { scene } = useCesium();
  const collRef = useRef<PointPrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const points = new PointPrimitiveCollection();

    if (filter.enabled) {
      for (const f of fires) {
        if (filter.minConfidence === "high" && f.confidence !== "high")
          continue;
        points.add({
          position: Cartesian3.fromDegrees(f.lon, f.lat),
          pixelSize: Math.max(3, Math.min(f.frp / 10, 12)),
          color: fireColor(f.frp),
          scaleByDistance: new NearFarScalar(1e4, 2.0, 1e7, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e7),
        });
      }
    }

    scene.primitives.add(points);
    collRef.current = points;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(points);
    };
  }, [scene, fires, filter.enabled, filter.minConfidence]);

  return null;
}
