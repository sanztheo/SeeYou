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

  const batchBufferRef = useRef<Map<number, SatellitePosition>>(new Map());
  const receivedChunksRef = useRef<Set<number>>(new Set());
  const expectedChunksRef = useRef<number>(0);

  const update = useCallback((positions: SatellitePosition[]): void => {
    const next = new Map<number, SatellitePosition>();
    for (const sat of positions) {
      next.set(sat.norad_id, sat);
    }
    console.log(`[SatelliteStore] full update: ${next.size} satellites`);
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
        batchBufferRef.current = new Map();
        receivedChunksRef.current = new Set();
        expectedChunksRef.current = totalChunks;
      }

      for (const sat of positions) {
        batchBufferRef.current.set(sat.norad_id, sat);
      }
      receivedChunksRef.current.add(chunkIndex);

      console.log(
        `[SatelliteStore] chunk ${chunkIndex + 1}/${totalChunks} (${positions.length} sats, buffer: ${batchBufferRef.current.size})`,
      );

      if (receivedChunksRef.current.size >= totalChunks) {
        const complete = batchBufferRef.current;
        console.log(
          `[SatelliteStore] batch complete — ${complete.size} satellites`,
        );
        setSatellites(new Map(complete));
        batchBufferRef.current = new Map();
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
