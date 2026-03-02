import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { Vessel, MaritimeFilter } from "../../types/maritime";

interface Props {
  vessels: Vessel[];
  filter: MaritimeFilter;
  onSelect?: (vessel: Vessel) => void;
}

function createShipCanvas(sanctioned: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d")!;
  const color = sanctioned ? "#EF4444" : "#60A5FA";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(22, 20);
  ctx.lineTo(12, 16);
  ctx.lineTo(2, 20);
  ctx.closePath();
  ctx.fill();
  if (sanctioned) {
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return canvas;
}

const normalShipCanvas = createShipCanvas(false);
const sanctionedShipCanvas = createShipCanvas(true);

const VESSEL_SCALE = new NearFarScalar(1e4, 2.0, 1e7, 0.4);
const VESSEL_DDC = new DistanceDisplayCondition(0, 3e7);

export function MaritimeLayer({ vessels, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, Vessel>());
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
        const vessel = dataMapRef.current.get(picked.id);
        if (vessel) onSelectRef.current?.(vessel);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });
    const map = new Map<string, Vessel>();

    if (filter.enabled) {
      for (const v of vessels) {
        if (filter.sanctionedOnly && !v.is_sanctioned) continue;
        map.set(v.mmsi, v);
        bbs.add({
          position: Cartesian3.fromDegrees(v.lon, v.lat),
          image: v.is_sanctioned ? sanctionedShipCanvas : normalShipCanvas,
          width: 16,
          height: 16,
          rotation: v.heading ? -(v.heading * Math.PI) / 180 : 0,
          verticalOrigin: VerticalOrigin.CENTER,
          color: v.is_sanctioned
            ? Color.RED
            : Color.fromCssColorString("#60A5FA"),
          scaleByDistance: VESSEL_SCALE,
          distanceDisplayCondition: VESSEL_DDC,
          id: v.mmsi,
        });
      }
    }

    scene.primitives.add(bbs);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, vessels, filter.enabled, filter.sanctionedOnly]);

  return null;
}
