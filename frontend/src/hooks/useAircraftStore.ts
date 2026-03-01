import { useState, useCallback, useMemo, useRef } from "react";
import type { AircraftPosition, AircraftFilter } from "../types/aircraft";

interface AircraftStore {
  aircraft: Map<string, AircraftPosition>;
  /** Full replacement (legacy AircraftUpdate). */
  update: (positions: AircraftPosition[]) => void;
  /** Chunked ingestion — accumulates chunks then flushes. */
  ingestBatch: (
    positions: AircraftPosition[],
    chunkIndex: number,
    totalChunks: number,
  ) => void;
  getFiltered: (filter: AircraftFilter) => AircraftPosition[];
  totalCount: number;
  militaryCount: number;
  civilianCount: number;
}

export function useAircraftStore(): AircraftStore {
  const [aircraft, setAircraft] = useState<Map<string, AircraftPosition>>(
    () => new Map(),
  );

  // Accumulation buffer for chunked ingestion
  const batchBufferRef = useRef<Map<string, AircraftPosition>>(new Map());
  const receivedChunksRef = useRef<Set<number>>(new Set());
  const expectedChunksRef = useRef<number>(0);

  const update = useCallback((positions: AircraftPosition[]): void => {
    const next = new Map<string, AircraftPosition>();
    for (const ac of positions) {
      next.set(ac.icao, ac);
    }
    if (import.meta.env.DEV) {
      let mil = 0;
      for (const a of next.values()) if (a.is_military) mil++;
      console.log(
        `[AircraftStore] full update: ${next.size} aircraft (mil: ${mil}, civ: ${next.size - mil})`,
      );
    }
    setAircraft(next);
  }, []);

  const ingestBatch = useCallback(
    (
      positions: AircraftPosition[],
      chunkIndex: number,
      totalChunks: number,
    ): void => {
      // New batch cycle detected — reset buffer
      if (
        totalChunks !== expectedChunksRef.current ||
        (chunkIndex === 0 && receivedChunksRef.current.size > 0)
      ) {
        batchBufferRef.current = new Map();
        receivedChunksRef.current = new Set();
        expectedChunksRef.current = totalChunks;
      }

      // Accumulate this chunk
      for (const ac of positions) {
        batchBufferRef.current.set(ac.icao, ac);
      }
      receivedChunksRef.current.add(chunkIndex);

      console.log(
        `[AircraftStore] chunk ${chunkIndex + 1}/${totalChunks} received (${positions.length} aircraft, buffer: ${batchBufferRef.current.size})`,
      );

      // Flush when all chunks received
      if (receivedChunksRef.current.size >= totalChunks) {
        const complete = batchBufferRef.current;
        const milCount = [...complete.values()].filter(
          (a) => a.is_military,
        ).length;
        console.log(
          `[AircraftStore] batch complete — ${complete.size} aircraft (mil: ${milCount}, civ: ${complete.size - milCount})`,
        );
        setAircraft(new Map(complete));
        batchBufferRef.current = new Map();
        receivedChunksRef.current = new Set();
      }
    },
    [],
  );

  const getFiltered = useCallback(
    (filter: AircraftFilter): AircraftPosition[] => {
      const result: AircraftPosition[] = [];
      for (const ac of aircraft.values()) {
        if (ac.is_military && !filter.showMilitary) continue;
        if (!ac.is_military && !filter.showCivilian) continue;
        result.push(ac);
      }
      return result;
    },
    [aircraft],
  );

  const { militaryCount, civilianCount } = useMemo(() => {
    let mil = 0;
    let civ = 0;
    for (const ac of aircraft.values()) {
      if (ac.is_military) {
        mil++;
      } else {
        civ++;
      }
    }
    return { militaryCount: mil, civilianCount: civ };
  }, [aircraft]);

  return {
    aircraft,
    update,
    ingestBatch,
    getFiltered,
    totalCount: aircraft.size,
    militaryCount,
    civilianCount,
  };
}
