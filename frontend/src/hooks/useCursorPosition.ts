import { useState, useEffect, useRef } from "react";
import {
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { Viewer } from "cesium";

interface CursorPosition {
  lat: number | null;
  lon: number | null;
  altitude: number | null;
}

const THROTTLE_MS = 100;

export function useCursorPosition(viewer: Viewer | null): CursorPosition {
  const [pos, setPos] = useState<CursorPosition>({
    lat: null,
    lon: null,
    altitude: null,
  });
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(
      (movement: { endPosition: { x: number; y: number } }) => {
        const now = performance.now();
        if (now - lastUpdate.current < THROTTLE_MS) return;
        lastUpdate.current = now;

        const ellipsoid = viewer.scene.globe.ellipsoid;
        const cartesian = viewer.camera.pickEllipsoid(
          movement.endPosition,
          ellipsoid,
        );

        if (defined(cartesian)) {
          const carto = Cartographic.fromCartesian(cartesian);
          const camHeight = viewer.camera.positionCartographic.height;
          setPos({
            lat: CesiumMath.toDegrees(carto.latitude),
            lon: CesiumMath.toDegrees(carto.longitude),
            altitude: camHeight,
          });
        } else {
          setPos({ lat: null, lon: null, altitude: null });
        }
      },
      ScreenSpaceEventType.MOUSE_MOVE,
    );

    return () => {
      if (!handler.isDestroyed()) handler.destroy();
    };
  }, [viewer]);

  return pos;
}
