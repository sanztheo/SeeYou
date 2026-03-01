import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
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

export function SeismicLayer({ earthquakes, filter }: Props): null {
  const { scene } = useCesium();
  const bbRef = useRef<BillboardCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });

    if (filter.enabled) {
      for (const eq of earthquakes) {
        if (eq.magnitude < filter.minMagnitude) continue;
        const size = magnitudeSize(eq.magnitude);
        bbs.add({
          position: Cartesian3.fromDegrees(eq.lon, eq.lat),
          image: circleCanvas,
          width: size,
          height: size,
          color: magnitudeColor(eq.magnitude),
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.5),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e7),
        });
      }
    }

    scene.primitives.add(bbs);
    bbRef.current = bbs;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, earthquakes, filter.enabled, filter.minMagnitude]);

  return null;
}
