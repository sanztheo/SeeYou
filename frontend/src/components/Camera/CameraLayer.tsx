import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  Cartesian3,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { Camera, CameraFilter } from "../../types/camera";
import { CAMERA_ICON_ONLINE, CAMERA_ICON_OFFLINE } from "./cameraIcon";

const CAM_BB_SCALE = new NearFarScalar(5_000, 1.0, 8_000_000, 0.05);

interface CameraLayerProps {
  cameras: Camera[];
  filter: CameraFilter;
  onSelect: (camera: Camera) => void;
}

export function CameraLayer({
  cameras,
  filter,
  onSelect,
}: CameraLayerProps): null {
  const { viewer } = useCesium();
  const bbCollRef = useRef<BillboardCollection | null>(null);
  const entryMapRef = useRef(
    new Map<string, ReturnType<BillboardCollection["add"]>>(),
  );
  const cameraMapRef = useRef(new Map<string, Camera>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!viewer) return;

    const bbColl = viewer.scene.primitives.add(
      new BillboardCollection({ scene: viewer.scene }),
    ) as BillboardCollection;
    bbCollRef.current = bbColl;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && typeof picked.id === "string") {
        const cam = cameraMapRef.current.get(picked.id);
        if (cam) onSelectRef.current(cam);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      entryMapRef.current.clear();
      cameraMapRef.current.clear();
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(bbColl);
      }
      bbCollRef.current = null;
    };
  }, [viewer]);

  const getVisibleCameras = useCallback((): Camera[] => {
    if (!filter.enabled) return [];
    const hasCityFilter = filter.cities.size > 0;
    const hasSourceFilter = filter.sources.size > 0;
    return cameras.filter(
      (c) =>
        (!hasCityFilter || filter.cities.has(c.city)) &&
        (!hasSourceFilter || filter.sources.has(c.source)),
    );
  }, [cameras, filter]);

  useEffect(() => {
    const bbColl = bbCollRef.current;
    if (!bbColl || !viewer) return;

    const visible = getVisibleCameras();
    const visibleIds = new Set(visible.map((c) => c.id));
    const entries = entryMapRef.current;

    const toDelete: string[] = [];
    for (const id of entries.keys()) {
      if (!visibleIds.has(id)) toDelete.push(id);
    }
    for (const id of toDelete) {
      const bb = entries.get(id)!;
      bbColl.remove(bb);
      entries.delete(id);
    }

    const nextMap = new Map<string, Camera>();
    for (const cam of visible) {
      nextMap.set(cam.id, cam);
      if (!entries.has(cam.id)) {
        const icon = cam.is_online ? CAMERA_ICON_ONLINE : CAMERA_ICON_OFFLINE;
        const bb = bbColl.add({
          position: Cartesian3.fromDegrees(cam.lon, cam.lat),
          image: icon,
          width: 24,
          height: 24,
          scaleByDistance: CAM_BB_SCALE,
          id: cam.id,
        });
        entries.set(cam.id, bb);
      }
    }

    cameraMapRef.current = nextMap;
  }, [cameras, filter, viewer, getVisibleCameras]);

  return null;
}
