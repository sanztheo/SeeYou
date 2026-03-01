import { useEffect } from "react";
import {
  CustomDataSource,
  Color,
  Cartesian3,
  VerticalOrigin,
  HorizontalOrigin,
  ArcType,
  PolylineDashMaterialProperty,
  CallbackProperty,
  JulianDate,
} from "cesium";
import type { AircraftPosition, FlightRoute } from "../../types/aircraft";
import {
  ROUTE_DEP_COLOR,
  ROUTE_ARR_COLOR,
  AIRPORT_COLOR,
} from "./aircraftUtils";

export function useFlightRoute(
  routeDsRef: { current: CustomDataSource | null },
  dataSourceRef: { current: CustomDataSource | null },
  flightRoute: FlightRoute | null,
  trackedIcao: string | null,
  aircraft: Map<string, AircraftPosition>,
): void {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable, read lazily via .current
  }, [flightRoute, trackedIcao, aircraft]);
}
