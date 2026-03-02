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
import type {
  SubmarineCable,
  LandingPoint,
  CablesFilter,
} from "../../types/cables";

interface Props {
  cables: SubmarineCable[];
  landingPoints: LandingPoint[];
  filter: CablesFilter;
  onSelect?: (cable: SubmarineCable) => void;
}

const CABLE_COLOR = Color.fromCssColorString("#00E5FF").withAlpha(0.6);
const LANDING_COLOR = Color.fromCssColorString("#00E5FF");
const CABLE_LP_SCALE = new NearFarScalar(1e4, 1.5, 1e7, 0.3);

export function SubmarineCableLayer({
  cables,
  landingPoints,
  filter,
  onSelect,
}: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, SubmarineCable>());
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
        const cable = dataMapRef.current.get(picked.id);
        if (cable) onSelectRef.current?.(cable);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const polylines = new PolylineCollection();
    const points = new PointPrimitiveCollection();
    const map = new Map<string, SubmarineCable>();

    if (filter.enabled) {
      for (const cable of cables) {
        if (cable.coordinates.length < 2) continue;
        map.set(cable.id, cable);
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
          id: cable.id,
        });
      }

      for (const lp of landingPoints) {
        points.add({
          position: Cartesian3.fromDegrees(lp.lon, lp.lat),
          pixelSize: 5,
          color: LANDING_COLOR,
          scaleByDistance: CABLE_LP_SCALE,
        });
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
  }, [scene, cables, landingPoints, filter.enabled]);

  return null;
}
