import { useMemo } from "react";

interface LodConfig {
  maxEntities: number;
  showLabels: boolean;
  pointSize: number;
  showOrbits: boolean;
}

export function useLevelOfDetail(cameraAltitude: number): LodConfig {
  return useMemo(() => {
    if (cameraAltitude > 10_000_000)
      return {
        maxEntities: 500,
        showLabels: false,
        pointSize: 2,
        showOrbits: false,
      };
    if (cameraAltitude > 5_000_000)
      return {
        maxEntities: 2000,
        showLabels: false,
        pointSize: 3,
        showOrbits: false,
      };
    if (cameraAltitude > 1_000_000)
      return {
        maxEntities: 5000,
        showLabels: true,
        pointSize: 4,
        showOrbits: true,
      };
    if (cameraAltitude > 100_000)
      return {
        maxEntities: 10000,
        showLabels: true,
        pointSize: 4,
        showOrbits: true,
      };
    return {
      maxEntities: 30000,
      showLabels: true,
      pointSize: 5,
      showOrbits: true,
    };
  }, [cameraAltitude]);
}
