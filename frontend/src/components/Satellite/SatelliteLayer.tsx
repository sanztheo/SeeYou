import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Cartesian3,
  Cartesian2,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  NearFarScalar,
  DistanceDisplayCondition,
  LabelStyle,
  VerticalOrigin,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Viewer,
  type Entity,
} from "cesium";
import type {
  SatellitePosition,
  SatelliteFilter,
  SatelliteCategory,
} from "../../types/satellite";
import { CATEGORY_FILTER_KEY } from "../../types/satellite";

const CATEGORY_COLORS: Record<SatelliteCategory, Color> = {
  Station: Color.GOLD,
  Starlink: Color.CYAN,
  Military: Color.RED,
  Weather: Color.GREEN,
  Navigation: Color.ROYALBLUE,
  Communication: Color.MEDIUMPURPLE,
  Science: Color.ORANGE,
  Other: Color.GRAY,
};

interface SatelliteLayerProps {
  satellites: Map<number, SatellitePosition>;
  filter: SatelliteFilter;
  onSelect?: (satellite: SatellitePosition) => void;
  onHover?: (
    satellite: SatellitePosition | null,
    screenX: number,
    screenY: number,
  ) => void;
}

export function SatelliteLayer({
  satellites,
  filter,
  onSelect,
  onHover,
}: SatelliteLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const satellitesRef = useRef(satellites);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);
  useEffect(() => {
    satellitesRef.current = satellites;
  }, [satellites]);

  useEffect(() => {
    if (!viewer) return;

    const ds = new CustomDataSource("satellites");
    viewer.dataSources.add(ds);
    dsRef.current = ds;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked?.id) && (picked.id as any)._satData) {
        onSelectRef.current?.((picked.id as any)._satData);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(move.endPosition);
      if (defined(picked?.id) && (picked.id as any)._satData) {
        onHoverRef.current?.(
          (picked.id as any)._satData,
          move.endPosition.x,
          move.endPosition.y,
        );
      } else {
        onHoverRef.current?.(null, 0, 0);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    viewer.camera.percentageChanged = 0.1;
    const onCameraChange = (): void => {
      if (viewer.isDestroyed() || !ds) return;
      cullEntities(viewer, ds);
    };
    viewer.camera.changed.addEventListener(onCameraChange);

    return (): void => {
      handler.destroy();
      viewer.camera.changed.removeEventListener(onCameraChange);
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
      }
      dsRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds || !viewer) return;

    const entities = ds.entities;
    const activeIds = new Set<string>();

    for (const [noradId, sat] of satellites) {
      if (!filter[CATEGORY_FILTER_KEY[sat.category]]) continue;

      const id = String(noradId);
      activeIds.add(id);

      const color = CATEGORY_COLORS[sat.category] ?? Color.GRAY;
      const isStation = sat.category === "Station";
      const pixelSize = isStation ? 6 : 4;
      const pos = Cartesian3.fromDegrees(
        sat.lon,
        sat.lat,
        sat.altitude_km * 1000,
      );

      const existing = entities.getById(id);
      if (existing) {
        (existing.position as ConstantPositionProperty).setValue(pos);
        existing.point!.color = new ConstantProperty(color);
        existing.point!.pixelSize = new ConstantProperty(pixelSize);
        (existing as any)._satData = sat;
      } else {
        const entity = entities.add({
          id,
          position: pos,
          point: {
            pixelSize,
            color,
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            scaleByDistance: new NearFarScalar(1e6, 1.5, 1e8, 0.5),
          },
          label: {
            text: sat.name,
            font: "11px monospace",
            fillColor: Color.WHITE.withAlpha(0.9),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -8),
            scaleByDistance: new NearFarScalar(5e5, 1, 5e7, 0),
            distanceDisplayCondition: new DistanceDisplayCondition(0, 1e7),
          },
        });
        (entity as any)._satData = sat;
      }
    }

    const toRemove: Entity[] = [];
    const all = entities.values;
    for (let i = 0; i < all.length; i++) {
      if (!activeIds.has(all[i].id)) toRemove.push(all[i]);
    }
    for (const e of toRemove) entities.remove(e);
  }, [satellites, filter, viewer]);

  return null;
}

function cullEntities(viewer: Viewer, ds: CustomDataSource): void {
  const camera = viewer.camera;
  const cameraPos = camera.positionWC;
  const height =
    viewer.scene.globe.ellipsoid.cartesianToCartographic(cameraPos)?.height ??
    1e8;

  if (height > 3e7) {
    ds.entities.values.forEach((e) => (e.show = true));
    return;
  }

  const rect = camera.computeViewRectangle();
  if (!rect) return;

  const west = rect.west * (180 / Math.PI);
  const east = rect.east * (180 / Math.PI);
  const south = rect.south * (180 / Math.PI);
  const north = rect.north * (180 / Math.PI);

  for (const entity of ds.entities.values) {
    const satData = (entity as any)._satData as SatellitePosition | undefined;
    if (!satData) continue;
    entity.show =
      satData.lat >= south &&
      satData.lat <= north &&
      satData.lon >= west &&
      satData.lon <= east;
  }
}
