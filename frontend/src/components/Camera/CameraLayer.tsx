import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Entity,
  Cartesian3,
  Cartesian2,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  defined,
} from "cesium";
import type { Camera, CameraFilter } from "../../types/camera";
import { CAMERA_ICON_ONLINE, CAMERA_ICON_OFFLINE } from "./cameraIcon";

const LABEL_DISTANCE = 50_000;

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
  const dsRef = useRef<CustomDataSource | null>(null);
  const cameraMapRef = useRef<Map<string, Camera>>(new Map());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!viewer) return;

    const ds = new CustomDataSource("cameras");
    viewer.dataSources.add(ds);
    dsRef.current = ds;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id instanceof Entity) {
        const cam = cameraMapRef.current.get(picked.id.id);
        if (cam) onSelectRef.current(cam);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
      }
      dsRef.current = null;
    };
  }, [viewer]);

  const getVisibleCameras = useCallback((): Camera[] => {
    if (!filter.enabled) return [];
    const hasCityFilter = filter.cities.size > 0;
    return cameras.filter((c) => !hasCityFilter || filter.cities.has(c.city));
  }, [cameras, filter]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds || !viewer) return;

    const visible = getVisibleCameras();
    const visibleIds = new Set(visible.map((c) => c.id));

    const existingIds = new Set<string>();
    for (let i = 0; i < ds.entities.values.length; i++) {
      existingIds.add(ds.entities.values[i].id);
    }

    for (const id of existingIds) {
      if (!visibleIds.has(id)) ds.entities.removeById(id);
    }

    const nextMap = new Map<string, Camera>();
    for (const cam of visible) {
      nextMap.set(cam.id, cam);
      if (!ds.entities.getById(cam.id)) {
        ds.entities.add(createEntity(cam));
      }
    }

    cameraMapRef.current = nextMap;
  }, [cameras, filter, viewer, getVisibleCameras]);

  return null;
}

function createEntity(cam: Camera): Entity.ConstructorOptions {
  const icon = cam.is_online ? CAMERA_ICON_ONLINE : CAMERA_ICON_OFFLINE;
  return {
    id: cam.id,
    position: Cartesian3.fromDegrees(cam.lon, cam.lat),
    billboard: {
      image: icon,
      width: 24,
      height: 24,
      verticalOrigin: VerticalOrigin.CENTER,
      scaleByDistance: new NearFarScalar(5_000, 1.0, 8_000_000, 0.05),
    },
    label: {
      text: cam.name,
      font: "11px monospace",
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      style: 2,
      pixelOffset: new Cartesian2(0, -18),
      distanceDisplayCondition: new DistanceDisplayCondition(0, LABEL_DISTANCE),
      scaleByDistance: new NearFarScalar(1_000, 1, LABEL_DISTANCE, 0.5),
    },
  };
}
