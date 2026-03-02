import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  PolylineCollection,
  PointPrimitiveCollection,
  Cartesian3,
  Color,
  Material,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { CyberThreat, CyberFilter } from "../../types/cyber";

interface Props {
  threats: CyberThreat[];
  filter: CyberFilter;
  onSelect?: (threat: CyberThreat) => void;
}

function confidenceColor(c: number): Color {
  if (c >= 80) return Color.RED.withAlpha(0.8);
  if (c >= 50) return Color.ORANGE.withAlpha(0.7);
  return Color.YELLOW.withAlpha(0.5);
}

const CYBER_SCALE = new NearFarScalar(1e5, 1.5, 1e7, 0.3);

export function CyberThreatLayer({ threats, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, CyberThreat>());
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
        const threat = dataMapRef.current.get(picked.id);
        if (threat) onSelectRef.current?.(threat);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const polylines = new PolylineCollection();
    const points = new PointPrimitiveCollection();
    const map = new Map<string, CyberThreat>();

    if (filter.enabled) {
      for (const t of threats) {
        if (t.confidence < filter.minConfidence) continue;
        const color = confidenceColor(t.confidence);
        map.set(t.id, t);

        points.add({
          position: Cartesian3.fromDegrees(t.src_lon, t.src_lat),
          pixelSize: 5,
          color,
          scaleByDistance: CYBER_SCALE,
          id: t.id,
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
            id: t.id,
          });
        }
      }
    }

    scene.primitives.add(polylines);
    scene.primitives.add(points);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) {
        scene.primitives.remove(polylines);
        scene.primitives.remove(points);
      }
    };
  }, [scene, threats, filter.enabled, filter.minConfidence]);

  return null;
}
