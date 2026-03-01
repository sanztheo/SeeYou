import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PolylineCollection,
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  Material,
  NearFarScalar,
} from "cesium";
import type { CyberThreat, CyberFilter } from "../../types/cyber";

interface Props {
  threats: CyberThreat[];
  filter: CyberFilter;
}

function confidenceColor(c: number): Color {
  if (c >= 80) return Color.RED.withAlpha(0.8);
  if (c >= 50) return Color.ORANGE.withAlpha(0.7);
  return Color.YELLOW.withAlpha(0.5);
}

export function CyberThreatLayer({ threats, filter }: Props): null {
  const { scene } = useCesium();
  const polyRef = useRef<PolylineCollection | null>(null);
  const pointRef = useRef<PointPrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const polylines = new PolylineCollection();
    const points = new PointPrimitiveCollection();

    if (filter.enabled) {
      for (const t of threats) {
        if (t.confidence < filter.minConfidence) continue;
        const color = confidenceColor(t.confidence);

        points.add({
          position: Cartesian3.fromDegrees(t.src_lon, t.src_lat),
          pixelSize: 5,
          color,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.3),
        });

        if (t.dst_lat != null && t.dst_lon != null) {
          const src = Cartesian3.fromDegrees(t.src_lon, t.src_lat);
          const dst = Cartesian3.fromDegrees(t.dst_lon, t.dst_lat);

          polylines.add({
            positions: [src, dst],
            width: 1.5,
            material: Material.fromType("PolylineGlow", {
              glowPower: 0.2,
              color,
            }),
          });
        }
      }
    }

    scene.primitives.add(polylines);
    scene.primitives.add(points);
    polyRef.current = polylines;
    pointRef.current = points;

    return () => {
      if (!scene.isDestroyed()) {
        scene.primitives.remove(polylines);
        scene.primitives.remove(points);
      }
    };
  }, [scene, threats, filter.enabled, filter.minConfidence]);

  return null;
}
