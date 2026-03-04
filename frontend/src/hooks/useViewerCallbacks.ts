import { useEffect, useRef } from "react";
import {
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Cartesian2,
} from "cesium";
import type { Viewer } from "cesium";

export interface CameraState {
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  pitch: number;
}

export interface CursorState {
  lat: number | null;
  lon: number | null;
  altitude: number | null;
}

const THROTTLE_MS = 80;

export function useViewerCallbacks(
  viewer: Viewer | null | undefined,
  onCameraChange?: (state: CameraState) => void,
  onCursorMove?: (state: CursorState) => void,
): void {
  const camRef = useRef(onCameraChange);
  const curRef = useRef(onCursorMove);
  useEffect(() => {
    camRef.current = onCameraChange;
  }, [onCameraChange]);
  useEffect(() => {
    curRef.current = onCursorMove;
  }, [onCursorMove]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    let lastCam = 0;
    let lastMouse = 0;

    const readCamera = (): void => {
      const now = performance.now();
      if (now - lastCam < THROTTLE_MS) return;
      lastCam = now;

      if (viewer.isDestroyed()) return;
      const carto = viewer.camera.positionCartographic;
      camRef.current?.({
        lat: CesiumMath.toDegrees(carto.latitude),
        lon: CesiumMath.toDegrees(carto.longitude),
        altitude: carto.height,
        heading: CesiumMath.toDegrees(viewer.camera.heading),
        pitch: CesiumMath.toDegrees(viewer.camera.pitch),
      });
    };

    viewer.camera.changed.addEventListener(readCamera);
    readCamera();

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(
      (movement: { endPosition: Cartesian2 }) => {
        const now = performance.now();
        if (now - lastMouse < THROTTLE_MS) return;
        lastMouse = now;

        if (viewer.isDestroyed()) return;
        const ellipsoid = viewer.scene.globe.ellipsoid;
        const cartesian = viewer.camera.pickEllipsoid(
          movement.endPosition,
          ellipsoid,
        );

        if (defined(cartesian)) {
          const carto = Cartographic.fromCartesian(cartesian);
          curRef.current?.({
            lat: CesiumMath.toDegrees(carto.latitude),
            lon: CesiumMath.toDegrees(carto.longitude),
            altitude: viewer.camera.positionCartographic.height,
          });
        } else {
          curRef.current?.({ lat: null, lon: null, altitude: null });
        }
      },
      ScreenSpaceEventType.MOUSE_MOVE,
    );

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(readCamera);
      }
      if (!handler.isDestroyed()) handler.destroy();
    };
  }, [viewer]);
}
