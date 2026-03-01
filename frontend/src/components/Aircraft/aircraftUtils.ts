import {
  Color,
  Cartesian3,
  Math as CesiumMath,
  SampledPositionProperty,
  JulianDate,
  LinearApproximation,
  ExtrapolationType,
} from "cesium";
import type {
  AircraftPosition,
  AircraftFilter,
  PredictedTrajectory,
} from "../../types/aircraft";

export const CIVILIAN_COLOR = Color.fromCssColorString("#3B82F6");
export const MILITARY_COLOR = Color.fromCssColorString("#EF4444");
export const LABEL_FONT = "12px monospace";

/** Predict this many seconds ahead — slightly > poll interval for smooth overlap. */
export const PREDICTION_SECS = 3;

function buildAircraftSvg(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2L13.5 13L4 18.5V21L13.5 18L13.5 26L10 28.5V30.5L16 28.5L22 30.5V28.5L18.5 26L18.5 18L28 21V18.5L18.5 13Z" fill="${hex}" stroke="#000" stroke-width="0.8"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const CIVIL_ICON = buildAircraftSvg("#3B82F6");
export const MIL_ICON = buildAircraftSvg("#EF4444");

/**
 * Dead-reckoning: predict where an aircraft will be in `dt` seconds
 * using its current heading, speed, and vertical rate.
 */
export function predictPosition(ac: AircraftPosition, dt: number): Cartesian3 {
  const headingRad = ac.heading * CesiumMath.RADIANS_PER_DEGREE;
  const distanceM = ac.speed_ms * dt;
  const latRad = ac.lat * CesiumMath.RADIANS_PER_DEGREE;

  const dLat = (distanceM * Math.cos(headingRad)) / 111_320;
  const cosLat = Math.cos(latRad);
  const dLon =
    cosLat > 0.001
      ? (distanceM * Math.sin(headingRad)) / (111_320 * cosLat)
      : 0;
  const dAlt = ac.vertical_rate_ms * dt;

  return Cartesian3.fromDegrees(
    ac.lon + dLon,
    ac.lat + dLat,
    Math.max(0, ac.altitude_m + dAlt),
  );
}

export function makePositionProperty(
  ac: AircraftPosition,
  now: JulianDate,
): SampledPositionProperty {
  const prop = new SampledPositionProperty();
  prop.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: LinearApproximation,
  });
  prop.forwardExtrapolationType = ExtrapolationType.EXTRAPOLATE;
  prop.backwardExtrapolationType = ExtrapolationType.HOLD;

  const current = Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude_m);
  const future = JulianDate.addSeconds(now, PREDICTION_SECS, new JulianDate());
  const predicted = predictPosition(ac, PREDICTION_SECS);

  prop.addSample(now, current);
  prop.addSample(future, predicted);

  return prop;
}

export const ROUTE_DEP_COLOR = Color.fromCssColorString("#22C55E");
export const ROUTE_ARR_COLOR = Color.WHITE;
export const AIRPORT_COLOR = Color.fromCssColorString("#FACC15");
export const PREDICTION_COLOR = Color.fromCssColorString("#FF6B35");
export const PATTERN_LABEL_FONT = "bold 11px monospace";

/** Extract a human-readable label from a MilitaryPattern. */
export function patternLabel(
  pat: PredictedTrajectory["pattern"],
): string | null {
  if (!pat) return null;
  if ("Orbit" in pat) return "ORBIT";
  if ("Cap" in pat) return "CAP";
  if ("Transit" in pat) return "TRANSIT";
  if ("Holding" in pat) return "HOLDING";
  return null;
}

// ── Incremental diffing (pure, testable) ──────────────────────

export interface EntityDiff {
  toAdd: AircraftPosition[];
  toUpdate: AircraftPosition[];
  toRemove: string[];
}

/**
 * Filter aircraft by civilian/military visibility.
 * Pure function — no side-effects.
 */
export function filterVisibleAircraft(
  aircraft: Map<string, AircraftPosition>,
  filter: AircraftFilter,
): Map<string, AircraftPosition> {
  const visible = new Map<string, AircraftPosition>();
  for (const ac of aircraft.values()) {
    if (ac.is_military && !filter.showMilitary) continue;
    if (!ac.is_military && !filter.showCivilian) continue;
    visible.set(ac.icao, ac);
  }
  return visible;
}

/**
 * Compute the minimal diff between what's currently rendered and what should be visible.
 * Pure function — no Cesium dependency.
 */
export function computeEntityDiff(
  visible: Map<string, AircraftPosition>,
  renderedIds: Set<string>,
): EntityDiff {
  const toRemove: string[] = [];
  for (const id of renderedIds) {
    if (!visible.has(id)) toRemove.push(id);
  }

  const toAdd: AircraftPosition[] = [];
  const toUpdate: AircraftPosition[] = [];
  for (const [id, ac] of visible) {
    if (renderedIds.has(id)) {
      toUpdate.push(ac);
    } else {
      toAdd.push(ac);
    }
  }

  return { toAdd, toUpdate, toRemove };
}
