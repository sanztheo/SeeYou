import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  NearFarScalar,
} from "cesium";
import type { AuroraPoint, SpaceWeatherFilter } from "../../types/spaceWeather";

interface Props {
  aurora: AuroraPoint[];
  kpIndex: number;
  filter: SpaceWeatherFilter;
}

function auroraProbColor(prob: number): Color {
  if (prob >= 80) return Color.fromCssColorString("#22C55E").withAlpha(0.85);
  if (prob >= 60) return Color.fromCssColorString("#4ADE80").withAlpha(0.7);
  if (prob >= 40) return Color.fromCssColorString("#86EFAC").withAlpha(0.5);
  if (prob >= 20) return Color.fromCssColorString("#BBF7D0").withAlpha(0.35);
  return Color.fromCssColorString("#DCFCE7").withAlpha(0.2);
}

export function SpaceWeatherLayer({
  aurora,
  kpIndex: _kpIndex,
  filter,
}: Props): null {
  const { scene } = useCesium();
  const collRef = useRef<PointPrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const points = new PointPrimitiveCollection();

    if (filter.enabled) {
      for (const a of aurora) {
        points.add({
          position: Cartesian3.fromDegrees(a.lon, a.lat, 110_000),
          pixelSize: 4,
          color: auroraProbColor(a.probability),
          scaleByDistance: new NearFarScalar(1e5, 2.0, 5e7, 0.3),
        });
      }
    }

    scene.primitives.add(points);
    collRef.current = points;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(points);
    };
  }, [scene, aurora, filter.enabled]);

  return null;
}
