import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Color,
  Cartesian3,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CesiumMath,
  defined,
  SampledPositionProperty,
  JulianDate,
  LinearApproximation,
  ExtrapolationType,
  ArcType,
  PolylineDashMaterialProperty,
  CallbackProperty,
  type Viewer,
} from "cesium";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
} from "../../types/aircraft";

const CIVILIAN_COLOR = Color.fromCssColorString("#3B82F6");
const MILITARY_COLOR = Color.fromCssColorString("#EF4444");
const LABEL_FONT = "12px monospace";

/** Predict this many seconds ahead — slightly > poll interval for smooth overlap. */
const PREDICTION_SECS = 6;

function buildAircraftSvg(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2L13.5 13L4 18.5V21L13.5 18L13.5 26L10 28.5V30.5L16 28.5L22 30.5V28.5L18.5 26L18.5 18L28 21V18.5L18.5 13Z" fill="${hex}" stroke="#000" stroke-width="0.8"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const CIVIL_ICON = buildAircraftSvg("#3B82F6");
const MIL_ICON = buildAircraftSvg("#EF4444");

/**
 * Dead-reckoning: predict where an aircraft will be in `dt` seconds
 * using its current heading, speed, and vertical rate.
 */
function predictPosition(ac: AircraftPosition, dt: number): Cartesian3 {
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

/**
 * Build a SampledPositionProperty with two samples:
 * current position (now) + predicted position (now + PREDICTION_SECS).
 * Cesium interpolates linearly between them → smooth movement.
 */
function makePositionProperty(
  ac: AircraftPosition,
  now: JulianDate,
): SampledPositionProperty {
  const prop = new SampledPositionProperty();
  prop.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: LinearApproximation,
  });
  // Without HOLD, Cesium returns undefined outside the sample window → invisible entities
  prop.forwardExtrapolationType = ExtrapolationType.HOLD;
  prop.backwardExtrapolationType = ExtrapolationType.HOLD;

  const current = Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude_m);
  const future = JulianDate.addSeconds(now, PREDICTION_SECS, new JulianDate());
  const predicted = predictPosition(ac, PREDICTION_SECS);

  prop.addSample(now, current);
  prop.addSample(future, predicted);

  return prop;
}

const ROUTE_DEP_COLOR = Color.fromCssColorString("#22C55E");
const ROUTE_ARR_COLOR = Color.WHITE;
const AIRPORT_COLOR = Color.fromCssColorString("#FACC15");

interface AircraftLayerProps {
  aircraft: Map<string, AircraftPosition>;
  filter: AircraftFilter;
  trackedIcao: string | null;
  onSelect?: (aircraft: AircraftPosition) => void;
  flightRoute: FlightRoute | null;
}

export function AircraftLayer({
  aircraft,
  filter,
  trackedIcao,
  onSelect,
  flightRoute,
}: AircraftLayerProps): null {
  const { viewer } = useCesium();
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const routeDsRef = useRef<CustomDataSource | null>(null);
  const onSelectRef = useRef(onSelect);
  const aircraftRef = useRef(aircraft);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    aircraftRef.current = aircraft;
  }, [aircraft]);

  // Store raw viewer in a mutable ref
  useEffect(() => {
    viewerRef.current = viewer ?? null;
  }, [viewer]);

  // Mount datasource, click handler, and ensure real-time clock
  useEffect(() => {
    if (!viewer) return;

    const ds = new CustomDataSource("aircraft");
    viewer.dataSources.add(ds);
    dataSourceRef.current = ds;

    const routeDs = new CustomDataSource("flightRoute");
    viewer.dataSources.add(routeDs);
    routeDsRef.current = routeDs;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick(event.position);
      if (defined(picked) && picked.id?.id) {
        const ac = aircraftRef.current.get(picked.id.id as string);
        if (ac) {
          onSelectRef.current?.(ac);
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return (): void => {
      handler.destroy();
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
        viewer.dataSources.remove(routeDs, true);
      }
      dataSourceRef.current = null;
      routeDsRef.current = null;
    };
  }, [viewer]);

  // Track selected entity — camera follows it continuously
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    const ds = dataSourceRef.current;

    if (!trackedIcao || !ds) {
      v.trackedEntity = undefined;
      return;
    }

    const entity = ds.entities.getById(trackedIcao);
    if (entity) {
      v.trackedEntity = entity;
    }
  }, [trackedIcao, aircraft]);

  // Sync entities with aircraft data and filter — chunked via rAF
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;

    const now = JulianDate.now();

    // Build visible aircraft list
    const visible: AircraftPosition[] = [];
    for (const ac of aircraft.values()) {
      if (ac.is_military && !filter.showMilitary) continue;
      if (!ac.is_military && !filter.showCivilian) continue;
      visible.push(ac);
    }
    const visibleIcaos = new Set(visible.map((ac) => ac.icao));

    // Remove stale entities first (synchronous — usually a small set)
    const toRemove: string[] = [];
    for (const entity of ds.entities.values) {
      if (entity.id && !visibleIcaos.has(entity.id)) {
        toRemove.push(entity.id);
      }
    }
    if (toRemove.length > 0) {
      ds.entities.suspendEvents();
      for (const id of toRemove) {
        const entity = ds.entities.getById(id);
        if (entity) ds.entities.remove(entity);
      }
      ds.entities.resumeEvents();
      console.log(`[AircraftLayer] removed ${toRemove.length} stale entities`);
    }

    // Chunked add/update via requestAnimationFrame
    const CHUNK_SIZE = 500;
    let cursor = 0;
    let rafId = 0;
    let cancelled = false;

    const processChunk = (): void => {
      if (cancelled) return;
      const end = Math.min(cursor + CHUNK_SIZE, visible.length);

      ds.entities.suspendEvents();
      for (let i = cursor; i < end; i++) {
        const ac = visible[i];
        const color = ac.is_military ? MILITARY_COLOR : CIVILIAN_COLOR;
        const icon = ac.is_military ? MIL_ICON : CIVIL_ICON;
        const label = ac.callsign ?? ac.icao;
        const rotation = -CesiumMath.toRadians(ac.heading);

        // Interpolated position: Cesium lerps between now → predicted future
        const posProp = makePositionProperty(ac, now);

        const entity = ds.entities.getById(ac.icao);
        if (entity) {
          // Update existing entity — just swap the position property + visuals
          entity.position = posProp as never;
          if (entity.billboard) {
            entity.billboard.image = icon as never;
            entity.billboard.color = color as never;
            entity.billboard.rotation = rotation as never;
          }
          if (entity.label) {
            entity.label.text = label as never;
          }
        } else {
          // Create new entity with interpolated position
          ds.entities.add({
            id: ac.icao,
            position: posProp as never,
            billboard: {
              image: icon,
              width: 24,
              height: 24,
              color,
              rotation,
              alignedAxis: Cartesian3.UNIT_Z,
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
              scaleByDistance: new NearFarScalar(5_000, 1.2, 2_000_000, 0.3),
            },
            label: {
              text: label,
              font: LABEL_FONT,
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: 2, // FILL_AND_OUTLINE
              verticalOrigin: VerticalOrigin.TOP,
              horizontalOrigin: HorizontalOrigin.LEFT,
              pixelOffset: { x: 14, y: 4 } as never,
              scaleByDistance: new NearFarScalar(1_000, 1.0, 500_000, 0.0),
            },
          });
        }
      }
      ds.entities.resumeEvents();

      console.log(
        `[AircraftLayer] rendered chunk ${Math.ceil(end / CHUNK_SIZE)}/${Math.ceil(visible.length / CHUNK_SIZE)} (${end}/${visible.length} entities)`,
      );

      cursor = end;
      if (cursor < visible.length) {
        rafId = requestAnimationFrame(processChunk);
      } else {
        console.log(
          `[AircraftLayer] render complete — ${visible.length} entities with smooth interpolation`,
        );
      }
    };

    if (visible.length > 0) {
      console.log(
        `[AircraftLayer] starting chunked render: ${visible.length} aircraft (interpolation: ${PREDICTION_SECS}s prediction)`,
      );
      rafId = requestAnimationFrame(processChunk);
    }

    return (): void => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [aircraft, filter]);

  // Draw flight route polylines + airport markers.
  // Uses CallbackProperty so polyline endpoints track the aircraft's
  // interpolated position every frame instead of a stale snapshot.
  useEffect(() => {
    const routeDs = routeDsRef.current;
    if (!routeDs) return;

    routeDs.entities.removeAll();

    if (!flightRoute || !trackedIcao) return;

    const { departure, arrival } = flightRoute;
    const depPos = Cartesian3.fromDegrees(departure.lon, departure.lat, 0);
    const arrPos = Cartesian3.fromDegrees(arrival.lon, arrival.lat, 0);

    const liveAc = aircraft.get(trackedIcao);
    const fallbackPos = liveAc
      ? Cartesian3.fromDegrees(liveAc.lon, liveAc.lat, liveAc.altitude_m)
      : depPos;

    const getAcPosition = (): Cartesian3 => {
      const acDs = dataSourceRef.current;
      if (acDs) {
        const entity = acDs.entities.getById(trackedIcao);
        if (entity?.position) {
          const p = entity.position.getValue(JulianDate.now());
          if (p) return p;
        }
      }
      return fallbackPos;
    };

    routeDs.entities.suspendEvents();

    // Departure → aircraft (green dashed)
    routeDs.entities.add({
      id: "route-dep-to-ac",
      polyline: {
        positions: new CallbackProperty(
          () => [depPos, getAcPosition()],
          false,
        ) as never,
        width: 2,
        material: new PolylineDashMaterialProperty({
          color: ROUTE_DEP_COLOR,
          dashLength: 16,
        }),
        arcType: ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // Aircraft → arrival (white dashed)
    routeDs.entities.add({
      id: "route-ac-to-arr",
      polyline: {
        positions: new CallbackProperty(
          () => [getAcPosition(), arrPos],
          false,
        ) as never,
        width: 2,
        material: new PolylineDashMaterialProperty({
          color: ROUTE_ARR_COLOR,
          dashLength: 16,
        }),
        arcType: ArcType.GEODESIC,
        clampToGround: false,
      },
    });

    // Departure airport marker
    routeDs.entities.add({
      id: "airport-dep",
      position: depPos,
      point: {
        pixelSize: 8,
        color: AIRPORT_COLOR,
        outlineColor: Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: departure.iata,
        font: "bold 13px monospace",
        fillColor: AIRPORT_COLOR,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2,
        verticalOrigin: VerticalOrigin.BOTTOM,
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: { x: 0, y: -10 } as never,
      },
    });

    // Arrival airport marker
    routeDs.entities.add({
      id: "airport-arr",
      position: arrPos,
      point: {
        pixelSize: 8,
        color: AIRPORT_COLOR,
        outlineColor: Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: arrival.iata,
        font: "bold 13px monospace",
        fillColor: AIRPORT_COLOR,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2,
        verticalOrigin: VerticalOrigin.BOTTOM,
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: { x: 0, y: -10 } as never,
      },
    });

    routeDs.entities.resumeEvents();
  }, [flightRoute, trackedIcao, aircraft]);

  return null;
}
