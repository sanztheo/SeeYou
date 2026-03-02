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
import type { Earthquake, SeismicFilter } from "../../types/seismic";

interface Props {
  earthquakes: Earthquake[];
  filter: SeismicFilter;
  onSelect?: (eq: Earthquake) => void;
}

function magnitudeColor(mag: number): Color {
  if (mag >= 7) return Color.RED;
  if (mag >= 6) return Color.ORANGERED;
  if (mag >= 5) return Color.ORANGE;
  if (mag >= 4) return Color.YELLOW;
  return Color.fromCssColorString("#FACC15");
}

function magnitudeSize(mag: number): number {
  return Math.max(8, Math.min(mag * 6, 48));
}

function createCircleCanvas(size: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

const circleCanvas = createCircleCanvas(64, "rgba(255,200,0,0.9)");
const SEISMIC_SCALE = new NearFarScalar(1e5, 1.5, 1e7, 0.5);
const SEISMIC_DDC = new DistanceDisplayCondition(0, 5e7);

export function SeismicLayer({ earthquakes, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, Earthquake>());
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
        const eq = dataMapRef.current.get(picked.id);
        if (eq) onSelectRef.current?.(eq);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });
    const map = new Map<string, Earthquake>();

    if (filter.enabled) {
      for (const eq of earthquakes) {
        if (eq.magnitude < filter.minMagnitude) continue;
        const size = magnitudeSize(eq.magnitude);
        map.set(eq.id, eq);
        bbs.add({
          position: Cartesian3.fromDegrees(eq.lon, eq.lat),
          image: circleCanvas,
          width: size,
          height: size,
          color: magnitudeColor(eq.magnitude),
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: SEISMIC_SCALE,
          distanceDisplayCondition: SEISMIC_DDC,
          id: eq.id,
        });
      }
    }

    scene.primitives.add(bbs);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, earthquakes, filter.enabled, filter.minMagnitude]);

  return null;
}
