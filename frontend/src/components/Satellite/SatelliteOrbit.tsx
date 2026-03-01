import { useEffect, useRef, type MutableRefObject } from "react";
import {
  CustomDataSource,
  Cartesian3,
  Color,
  PolylineDashMaterialProperty,
  type Viewer,
} from "cesium";
import type { SatellitePosition } from "../../types/satellite";

const EARTH_RADIUS_KM = 6371;
const ORBIT_POINTS = 120;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Generates a ground-track approximation by treating the orbit as a
 * great circle whose inclination is derived from the satellite's latitude.
 */
function computeOrbitPositions(sat: SatellitePosition): Cartesian3[] {
  const r = EARTH_RADIUS_KM + sat.altitude_km;
  const altMeters = sat.altitude_km * 1000;
  const incRad = Math.max(Math.abs(sat.lat) + 5, 25) * DEG;

  const sinPhase = Math.sin(sat.lat * DEG) / Math.sin(incRad);
  const phase0 = Math.asin(Math.max(-1, Math.min(1, sinPhase)));
  const lonRef =
    Math.atan2(Math.cos(incRad) * Math.sin(phase0), Math.cos(phase0)) * RAD;

  const period = (2 * Math.PI * r) / sat.velocity_km_s;
  const earthRotPerSec = 360 / 86400;

  const positions: Cartesian3[] = [];
  for (let i = 0; i <= ORBIT_POINTS; i++) {
    const frac = i / ORBIT_POINTS;
    const angle = phase0 + (frac - 0.5) * 2 * Math.PI;
    const t = (frac - 0.5) * period;

    const lat = Math.asin(Math.sin(incRad) * Math.sin(angle)) * RAD;
    const lonOffset =
      Math.atan2(Math.cos(incRad) * Math.sin(angle), Math.cos(angle)) * RAD;
    const lon = sat.lon + (lonOffset - lonRef) - earthRotPerSec * t;

    positions.push(Cartesian3.fromDegrees(lon, lat, altMeters));
  }
  return positions;
}

export function useOrbitPath(
  viewerRef: MutableRefObject<Viewer | null>,
  selectedSatellite: SatellitePosition | null,
): void {
  const dsRef = useRef<CustomDataSource | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (!dsRef.current) {
      const ds = new CustomDataSource("satelliteOrbit");
      viewer.dataSources.add(ds);
      dsRef.current = ds;
    }

    const ds = dsRef.current;
    ds.entities.removeAll();

    if (!selectedSatellite) return;

    const positions = computeOrbitPositions(selectedSatellite);

    ds.entities.add({
      polyline: {
        positions,
        width: 1.5,
        material: new PolylineDashMaterialProperty({
          color: Color.WHITE.withAlpha(0.5),
          dashLength: 16,
        }),
      },
    });

    return (): void => {
      ds.entities.removeAll();
    };
  }, [viewerRef, selectedSatellite]);

  useEffect(() => {
    return (): void => {
      const viewer = viewerRef.current;
      const ds = dsRef.current;
      if (ds && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
      }
      dsRef.current = null;
    };
  }, [viewerRef]);
}
