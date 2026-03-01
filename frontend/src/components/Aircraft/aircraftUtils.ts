import {
  Color,
  Cartesian3,
  Math as CesiumMath,
  SampledPositionProperty,
  JulianDate,
  LinearApproximation,
  ExtrapolationType,
  Occluder,
  BoundingSphere,
  Rectangle,
  Cartographic,
  Ellipsoid,
  CustomDataSource,
  type Viewer,
} from "cesium";
import type {
  AircraftPosition,
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

// ── Viewport culling (pre-allocated to avoid GC pressure) ────────
const scratchViewRect = new Rectangle();
const scratchPaddedRect = new Rectangle();
const GLOBE_SPHERE = new BoundingSphere(
  Cartesian3.ZERO,
  Ellipsoid.WGS84.minimumRadius,
);
const RECT_PAD_RAD = CesiumMath.toRadians(2);

/**
 * Toggle entity.show for every aircraft entity based on whether it falls
 * inside the camera's current view rectangle AND is not occluded by the globe.
 */
export function cullEntities(
  viewer: Viewer,
  ds: CustomDataSource,
  trackedIcao: string | null,
): void {
  const viewRect = viewer.camera.computeViewRectangle(
    viewer.scene.globe.ellipsoid,
    scratchViewRect,
  );

  if (!viewRect) {
    for (const entity of ds.entities.values) entity.show = true;
    return;
  }

  scratchPaddedRect.west = viewRect.west - RECT_PAD_RAD;
  scratchPaddedRect.south = Math.max(
    viewRect.south - RECT_PAD_RAD,
    -CesiumMath.PI_OVER_TWO,
  );
  scratchPaddedRect.east = viewRect.east + RECT_PAD_RAD;
  scratchPaddedRect.north = Math.min(
    viewRect.north + RECT_PAD_RAD,
    CesiumMath.PI_OVER_TWO,
  );

  const occluder = new Occluder(GLOBE_SPHERE, viewer.camera.position);
  const now = JulianDate.now();
  const entities = ds.entities.values;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    if (entity.id === trackedIcao) {
      entity.show = true;
      continue;
    }

    const pos = entity.position?.getValue(now);
    if (!pos) {
      entity.show = false;
      continue;
    }

    const carto = Cartographic.fromCartesian(pos);
    if (!Rectangle.contains(scratchPaddedRect, carto)) {
      entity.show = false;
      continue;
    }

    entity.show = occluder.isPointVisible(pos);
  }
}

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
