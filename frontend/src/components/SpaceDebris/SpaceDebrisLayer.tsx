import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
} from "cesium";
import type { SatellitePosition } from "../../types/satellite";

interface Props {
  debris: SatellitePosition[];
  enabled: boolean;
}

const DEBRIS_COLOR = Color.fromCssColorString("#FF4444").withAlpha(0.5);

export function SpaceDebrisLayer({ debris, enabled }: Props): null {
  const { scene } = useCesium();
  const collRef = useRef<PointPrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const points = new PointPrimitiveCollection();

    if (enabled) {
      for (const d of debris) {
        points.add({
          position: Cartesian3.fromDegrees(d.lon, d.lat, d.altitude_km * 1000),
          pixelSize: 2,
          color: DEBRIS_COLOR,
          scaleByDistance: new NearFarScalar(1e5, 1.0, 5e7, 0.2),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e7),
        });
      }
    }

    scene.primitives.add(points);
    collRef.current = points;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(points);
    };
  }, [scene, debris, enabled]);

  return null;
}
