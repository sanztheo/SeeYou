import { useState, useCallback, useMemo, useRef } from "react";
import type { SatellitePosition, SatelliteCategory } from "../types/satellite";

type CategoryCounts = Record<SatelliteCategory, number>;

interface SatelliteStore {
  satellites: Map<number, SatellitePosition>;
  update: (positions: SatellitePosition[]) => void;
  ingestBatch: (
    positions: SatellitePosition[],
    chunkIndex: number,
    totalChunks: number,
  ) => void;
  totalCount: number;
  categoryCounts: CategoryCounts;
}

const EMPTY_COUNTS: CategoryCounts = {
  Station: 0,
  Starlink: 0,
  Communication: 0,
  Military: 0,
  Weather: 0,
  Navigation: 0,
  Science: 0,
  Other: 0,
};

export function useSatelliteStore(): SatelliteStore {
  const [satellites, setSatellites] = useState<Map<number, SatellitePosition>>(
    () => new Map(),
  );

  const receivedChunksRef = useRef<Set<number>>(new Set());
  const expectedChunksRef = useRef<number>(0);

  const update = useCallback((positions: SatellitePosition[]): void => {
    const next = new Map<number, SatellitePosition>();
    for (const sat of positions) {
      next.set(sat.norad_id, sat);
    }
    setSatellites(next);
  }, []);

  const ingestBatch = useCallback(
    (
      positions: SatellitePosition[],
      chunkIndex: number,
      totalChunks: number,
    ): void => {
      if (
        totalChunks !== expectedChunksRef.current ||
        (chunkIndex === 0 && receivedChunksRef.current.size > 0)
      ) {
        receivedChunksRef.current = new Set();
        expectedChunksRef.current = totalChunks;
      }

      receivedChunksRef.current.add(chunkIndex);
      const freshBatch = chunkIndex === 0;

      setSatellites((prev) => {
        const next = freshBatch
          ? new Map<number, SatellitePosition>()
          : new Map(prev);
        for (const sat of positions) {
          next.set(sat.norad_id, sat);
        }
        return next;
      });

      if (receivedChunksRef.current.size >= totalChunks) {
        receivedChunksRef.current = new Set();
      }
    },
    [],
  );

  const categoryCounts = useMemo(() => {
    const counts = { ...EMPTY_COUNTS };
    for (const sat of satellites.values()) {
      counts[sat.category] = (counts[sat.category] ?? 0) + 1;
    }
    return counts;
  }, [satellites]);

  return {
    satellites,
    update,
    ingestBatch,
    totalCount: satellites.size,
    categoryCounts,
  };
}
