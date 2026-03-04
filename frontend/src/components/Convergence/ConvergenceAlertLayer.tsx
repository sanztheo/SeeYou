import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  Cartesian3,
  NearFarScalar,
  VerticalOrigin,
} from "cesium";

export interface ConvergenceZone {
  lat: number;
  lon: number;
  radius_km: number;
  layers: string[];
  severity: string;
  description: string;
}

interface Props {
  zones: ConvergenceZone[];
  enabled: boolean;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "rgba(239,68,68,0.9)";
    case "high":
      return "rgba(249,115,22,0.8)";
    case "medium":
      return "rgba(234,179,8,0.7)";
    default:
      return "rgba(96,165,250,0.6)";
  }
}

function createAlertCanvas(severity: string): HTMLCanvasElement {
  const s = 48;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const r = s / 2;
  const color = severityColor(severity);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(r, r, r - 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#FFF";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", r, r);

  return canvas;
}

const canvasCache = new Map<string, HTMLCanvasElement>();
function getAlertCanvas(severity: string): HTMLCanvasElement {
  if (!canvasCache.has(severity)) {
    canvasCache.set(severity, createAlertCanvas(severity));
  }
  return canvasCache.get(severity)!;
}

export function ConvergenceAlertLayer({ zones, enabled }: Props): null {
  const { scene } = useCesium();
  const bbRef = useRef<BillboardCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });

    if (enabled) {
      for (const zone of zones) {
        bbs.add({
          position: Cartesian3.fromDegrees(zone.lon, zone.lat),
          image: getAlertCanvas(zone.severity),
          width: 32,
          height: 32,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e4, 2.0, 1e7, 0.5),
        });
      }
    }

    scene.primitives.add(bbs);
    bbRef.current = bbs;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, zones, enabled]);

  return null;
}
