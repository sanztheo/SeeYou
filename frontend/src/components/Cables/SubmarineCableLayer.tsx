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
import type { SubmarineCable, LandingPoint, CablesFilter } from "../../types/cables";

interface Props {
  cables: SubmarineCable[];
  landingPoints: LandingPoint[];
  filter: CablesFilter;
}

const CABLE_COLOR = Color.fromCssColorString("#00E5FF").withAlpha(0.6);
const LANDING_COLOR = Color.fromCssColorString("#00E5FF");

export function SubmarineCableLayer({ cables, landingPoints, filter }: Props): null {
  const { scene } = useCesium();
  const polyRef = useRef<PolylineCollection | null>(null);
  const pointRef = useRef<PointPrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const polylines = new PolylineCollection();
    const points = new PointPrimitiveCollection();

    if (filter.enabled) {
      for (const cable of cables) {
        if (cable.coordinates.length < 2) continue;
        const positions = cable.coordinates.map(([lon, lat]) =>
          Cartesian3.fromDegrees(lon, lat),
        );
        polylines.add({
          positions,
          width: 2,
          material: Material.fromType("PolylineGlow", {
            glowPower: 0.25,
            color: CABLE_COLOR,
          }),
        });
      }

      for (const lp of landingPoints) {
        points.add({
          position: Cartesian3.fromDegrees(lp.lon, lp.lat),
          pixelSize: 5,
          color: LANDING_COLOR,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.3),
        });
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
  }, [scene, cables, landingPoints, filter.enabled]);

  return null;
}
