import type { Camera, CameraViewSource } from "../../types/camera";

export interface CameraViewInfo {
  headingDeg: number;
  fovDeg: number;
  source: CameraViewSource;
}

export function normalizeHeadingDeg(deg: number): number {
  const norm = deg % 360;
  return norm < 0 ? norm + 360 : norm;
}

export function clampFovDeg(deg: number): number {
  return Math.max(20, Math.min(120, deg));
}

export function defaultFovForSource(source: string): number {
  const s = source.toLowerCase();
  if (
    s === "caltrans" ||
    s === "nycdot" ||
    s === "tfl" ||
    s.startsWith("otcmap")
  ) {
    return 42;
  }
  if (s === "mcp.camera") return 50;
  if (s === "generic" || s === "paris_opendata") return 68;
  return 55;
}

function tokenHeading(token: string): number | null {
  switch (token) {
    case "N":
    case "NORTH":
    case "NB":
      return 0;
    case "NE":
    case "NORTHEAST":
      return 45;
    case "E":
    case "EAST":
    case "EB":
      return 90;
    case "SE":
    case "SOUTHEAST":
      return 135;
    case "S":
    case "SOUTH":
    case "SB":
      return 180;
    case "SW":
    case "SOUTHWEST":
      return 225;
    case "W":
    case "WEST":
    case "WB":
      return 270;
    case "NW":
    case "NORTHWEST":
      return 315;
    default:
      return null;
  }
}

export function parseHeadingFromHint(hint: string): number | null {
  const raw = hint.trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (upper.includes("NORTHEAST")) return 45;
  if (upper.includes("SOUTHEAST")) return 135;
  if (upper.includes("SOUTHWEST")) return 225;
  if (upper.includes("NORTHWEST")) return 315;
  if (upper.includes("NORTHBOUND")) return 0;
  if (upper.includes("EASTBOUND")) return 90;
  if (upper.includes("SOUTHBOUND")) return 180;
  if (upper.includes("WESTBOUND")) return 270;

  const clean = upper.replace(/[^A-Z0-9]+/g, " ");
  for (const token of clean.split(/\s+/)) {
    const heading = tokenHeading(token);
    if (heading != null) return heading;
  }
  return null;
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeHeadingDeg(brng);
}

function cityCentroid(camera: Camera, cameras: Camera[]): { lat: number; lon: number } | null {
  const cityCams = cameras.filter(
    (c) =>
      c.city === camera.city &&
      c.id !== camera.id &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lon),
  );
  if (cityCams.length === 0) return null;

  let latSum = 0;
  let lonSum = 0;
  for (const c of cityCams) {
    latSum += c.lat;
    lonSum += c.lon;
  }
  return { lat: latSum / cityCams.length, lon: lonSum / cityCams.length };
}

function resolveFov(camera: Camera): number {
  const sourceDefault = defaultFovForSource(camera.source);
  return clampFovDeg(camera.view_fov_deg ?? sourceDefault);
}

export function resolveCameraView(camera: Camera, cameras: Camera[]): CameraViewInfo {
  const headingFromProvider = camera.view_heading_deg;
  if (typeof headingFromProvider === "number" && Number.isFinite(headingFromProvider)) {
    return {
      headingDeg: normalizeHeadingDeg(headingFromProvider),
      fovDeg: resolveFov(camera),
      source: camera.view_heading_source ?? "provider",
    };
  }

  const parsed =
    parseHeadingFromHint(camera.view_hint ?? "") ??
    parseHeadingFromHint(camera.name);
  if (parsed != null) {
    return {
      headingDeg: parsed,
      fovDeg: resolveFov(camera),
      source: "parsed",
    };
  }

  const centroid = cityCentroid(camera, cameras);
  if (centroid) {
    return {
      headingDeg: bearingDeg(camera.lat, camera.lon, centroid.lat, centroid.lon),
      fovDeg: resolveFov(camera),
      source: "estimated",
    };
  }

  return {
    headingDeg: 0,
    fovDeg: resolveFov(camera),
    source: "estimated",
  };
}

export function compassLabel(headingDeg: number): string {
  const norm = normalizeHeadingDeg(headingDeg);
  if (norm < 22.5) return "N";
  if (norm < 67.5) return "NE";
  if (norm < 112.5) return "E";
  if (norm < 157.5) return "SE";
  if (norm < 202.5) return "S";
  if (norm < 247.5) return "SW";
  if (norm < 292.5) return "W";
  if (norm < 337.5) return "NW";
  return "N";
}
