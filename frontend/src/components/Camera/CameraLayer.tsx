import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Entity,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Viewer,
} from "cesium";
import type { Camera, CameraFilter } from "../../types/camera";

const ALTITUDE_THRESHOLD = 100_000;
const POINT_SIZE = 10;
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
      const existing = ds.entities.getById(cam.id);

      if (existing) {
        updateEntity(existing, cam);
      } else {
        ds.entities.add(createEntity(cam));
      }
    }

    cameraMapRef.current = nextMap;
  }, [cameras, filter, viewer, getVisibleCameras]);

  useEffect(() => {
    if (!viewer) return;

    const onCameraChanged = (): void => {
      if (viewer.isDestroyed() || !dsRef.current) return;
      const alt = viewer.camera.positionCartographic.height;
      const show = alt < ALTITUDE_THRESHOLD;
      const entities = dsRef.current.entities.values;
      for (let i = 0; i < entities.length; i++) {
        entities[i].show = show;
      }
    };

    viewer.camera.percentageChanged = 0.1;
    viewer.camera.changed.addEventListener(onCameraChanged);
    onCameraChanged();

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(onCameraChanged);
      }
    };
  }, [viewer]);

  return null;
}

function createEntity(cam: Camera): Entity.ConstructorOptions {
  const color = cam.is_online ? Color.LIME : Color.RED;
  return {
    id: cam.id,
    position: Cartesian3.fromDegrees(cam.lon, cam.lat),
    point: {
      pixelSize: POINT_SIZE,
      color,
      outlineColor: Color.BLACK,
      outlineWidth: 1,
      scaleByDistance: new NearFarScalar(1_000, 1.2, 100_000, 0.6),
    },
    label: {
      text: `📷 ${cam.name}`,
      font: "11px monospace",
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      style: 2,
      pixelOffset: { x: 0, y: -16, z: 0 } as unknown as Cartesian3,
      distanceDisplayCondition: new DistanceDisplayCondition(0, LABEL_DISTANCE),
      scaleByDistance: new NearFarScalar(1_000, 1, LABEL_DISTANCE, 0.5),
    },
  };
}

function updateEntity(entity: Entity, cam: Camera): void {
  const color = cam.is_online ? Color.LIME : Color.RED;
  if (entity.point) {
    entity.point.color = color as unknown as typeof entity.point.color;
  }
}
