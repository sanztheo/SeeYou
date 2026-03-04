import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  Cartesian3,
  Color,
  CustomDataSource,
  PolygonHierarchy,
} from "cesium";
import type { Camera } from "../../types/camera";
import type { CameraViewInfo } from "./cameraView";

interface CameraFocusLayerProps {
  camera: Camera | null;
  view: CameraViewInfo | null;
}

const EARTH_RADIUS_M = 6_371_000;
const ARC_STEPS = 24;

function rangeForSource(source: string): number {
  const s = source.toLowerCase();
  if (
    s === "caltrans" ||
    s === "nycdot" ||
    s === "tfl" ||
    s.startsWith("otcmap")
  ) {
    return 900;
  }
  if (s === "generic" || s === "paris_opendata") return 2500;
  return 1200;
}

function styleForViewSource(source: CameraViewInfo["source"]): {
  fill: Color;
  stroke: Color;
} {
  switch (source) {
    case "provider":
      return {
        fill: Color.fromCssColorString("#22d3ee").withAlpha(0.18),
        stroke: Color.fromCssColorString("#22d3ee").withAlpha(0.9),
      };
    case "parsed":
      return {
        fill: Color.fromCssColorString("#f59e0b").withAlpha(0.16),
        stroke: Color.fromCssColorString("#f59e0b").withAlpha(0.9),
      };
    default:
      return {
        fill: Color.fromCssColorString("#94a3b8").withAlpha(0.12),
        stroke: Color.fromCssColorString("#cbd5e1").withAlpha(0.85),
      };
  }
}

function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lon: number } {
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (latDeg * Math.PI) / 180;
  const lon1 = (lonDeg * Math.PI) / 180;
  const ang = distanceM / EARTH_RADIUS_M;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAng = Math.sin(ang);
  const cosAng = Math.cos(ang);

  const lat2 = Math.asin(
    sinLat1 * cosAng + cosLat1 * sinAng * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * sinAng * cosLat1,
      cosAng - sinLat1 * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

function normalizeHeadingDeg(deg: number): number {
  const norm = deg % 360;
  return norm < 0 ? norm + 360 : norm;
}

function buildConePositions(
  camera: Camera,
  view: CameraViewInfo,
  rangeM: number,
): Cartesian3[] {
  const heading = normalizeHeadingDeg(view.headingDeg);
  const half = view.fovDeg / 2;
  const start = heading - half;
  const end = heading + half;
  const out: Cartesian3[] = [Cartesian3.fromDegrees(camera.lon, camera.lat)];

  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const t = i / ARC_STEPS;
    const bearing = start + (end - start) * t;
    const p = destinationPoint(camera.lat, camera.lon, bearing, rangeM);
    out.push(Cartesian3.fromDegrees(p.lon, p.lat));
  }
  return out;
}

export function CameraFocusLayer({
  camera,
  view,
}: CameraFocusLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const ds = new CustomDataSource("camera-focus");
    viewer.dataSources.add(ds);
    dsRef.current = ds;

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
      }
      dsRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds) return;
    ds.entities.removeAll();
    if (!camera || !view) return;

    const rangeM = rangeForSource(camera.source);
    const conePositions = buildConePositions(camera, view, rangeM);
    const axisEnd = destinationPoint(
      camera.lat,
      camera.lon,
      view.headingDeg,
      rangeM,
    );
    const center = Cartesian3.fromDegrees(camera.lon, camera.lat);
    const axis = Cartesian3.fromDegrees(axisEnd.lon, axisEnd.lat);
    const style = styleForViewSource(view.source);

    ds.entities.add({
      id: `camera-focus-cone-${camera.id}`,
      polygon: {
        hierarchy: new PolygonHierarchy(conePositions) as never,
        material: style.fill as never,
        outline: true,
        outlineColor: style.stroke as never,
        outlineWidth: 1.5 as never,
      },
    });

    ds.entities.add({
      id: `camera-focus-axis-${camera.id}`,
      polyline: {
        positions: [center, axis] as never,
        width: 2.0,
        material: style.stroke as never,
        clampToGround: true,
      },
    });
  }, [camera, view]);

  return null;
}
