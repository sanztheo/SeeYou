import { describe, it, expect } from "vitest";
import type { AircraftPosition } from "../types/aircraft";
import {
  createEmptyBatchState,
  ingestChunk,
  type BatchState,
} from "./batchAccumulator";

function makeAircraft(
  icao: string,
  overrides: Partial<AircraftPosition> = {},
): AircraftPosition {
  return {
    icao,
    callsign: null,
    aircraft_type: null,
    lat: 48.0,
    lon: 2.0,
    altitude_m: 10000,
    speed_ms: 250,
    heading: 90,
    vertical_rate_ms: 0,
    on_ground: false,
    is_military: false,
    ...overrides,
  };
}

function toEntries(aircraft: AircraftPosition[]): [string, AircraftPosition][] {
  return aircraft.map((ac) => [ac.icao, ac]);
}

describe("batchAccumulator", () => {
  describe("single-chunk batch", () => {
    it("flushes immediately when totalChunks=1", () => {
      const state = createEmptyBatchState<string, AircraftPosition>();
      const items = toEntries([makeAircraft("A1"), makeAircraft("A2")]);

      const result = ingestChunk(state, items, 0, 1);

      expect(result.flushed).not.toBeNull();
      expect(result.flushed!.size).toBe(2);
      expect(result.flushed!.has("A1")).toBe(true);
      expect(result.flushed!.has("A2")).toBe(true);
    });
  });

  describe("multi-chunk batch", () => {
    it("accumulates without flushing until last chunk", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const r1 = ingestChunk(state, toEntries([makeAircraft("A1")]), 0, 3);
      expect(r1.flushed).toBeNull();
      state = r1.state;
      expect(state.buffer.size).toBe(1);

      const r2 = ingestChunk(state, toEntries([makeAircraft("A2")]), 1, 3);
      expect(r2.flushed).toBeNull();
      state = r2.state;
      expect(state.buffer.size).toBe(2);

      const r3 = ingestChunk(state, toEntries([makeAircraft("A3")]), 2, 3);
      expect(r3.flushed).not.toBeNull();
      expect(r3.flushed!.size).toBe(3);
    });

    it("contains all aircraft from all chunks on flush", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const chunk0 = Array.from({ length: 100 }, (_, i) =>
        makeAircraft(`C0_${i}`),
      );
      const chunk1 = Array.from({ length: 100 }, (_, i) =>
        makeAircraft(`C1_${i}`),
      );

      const r0 = ingestChunk(state, toEntries(chunk0), 0, 2);
      expect(r0.flushed).toBeNull();
      state = r0.state;

      const r1 = ingestChunk(state, toEntries(chunk1), 1, 2);
      expect(r1.flushed).not.toBeNull();
      expect(r1.flushed!.size).toBe(200);

      for (const ac of chunk0) expect(r1.flushed!.has(ac.icao)).toBe(true);
      for (const ac of chunk1) expect(r1.flushed!.has(ac.icao)).toBe(true);
    });
  });

  describe("new cycle detection", () => {
    it("resets buffer when chunk 0 arrives after a previous cycle", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const r0 = ingestChunk(state, toEntries([makeAircraft("OLD1")]), 0, 2);
      state = r0.state;

      const r1 = ingestChunk(state, toEntries([makeAircraft("OLD2")]), 1, 2);
      expect(r1.flushed).not.toBeNull();
      state = r1.state;

      const r2 = ingestChunk(state, toEntries([makeAircraft("NEW1")]), 0, 2);
      expect(r2.flushed).toBeNull();
      state = r2.state;
      expect(state.buffer.size).toBe(1);
      expect(state.buffer.has("NEW1")).toBe(true);
      expect(state.buffer.has("OLD1")).toBe(false);
    });

    it("resets buffer when totalChunks changes mid-cycle", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const r0 = ingestChunk(state, toEntries([makeAircraft("A1")]), 0, 3);
      state = r0.state;
      expect(state.expectedChunks).toBe(3);

      const r1 = ingestChunk(state, toEntries([makeAircraft("B1")]), 0, 5);
      state = r1.state;
      expect(state.expectedChunks).toBe(5);
      expect(state.buffer.size).toBe(1);
      expect(state.buffer.has("B1")).toBe(true);
    });
  });

  describe("out-of-order chunks", () => {
    it("chunk 0 arriving after others triggers cycle reset (by design)", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const r2 = ingestChunk(state, toEntries([makeAircraft("A3")]), 2, 3);
      expect(r2.flushed).toBeNull();
      state = r2.state;

      // Chunk 0 resets the cycle — A3 from the earlier chunk is lost
      const r0 = ingestChunk(state, toEntries([makeAircraft("A1")]), 0, 3);
      expect(r0.flushed).toBeNull();
      state = r0.state;
      expect(state.buffer.size).toBe(1);
      expect(state.buffer.has("A1")).toBe(true);
      expect(state.buffer.has("A3")).toBe(false);
    });

    it("non-zero chunks arriving out of order still accumulate", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const r0 = ingestChunk(state, toEntries([makeAircraft("A1")]), 0, 3);
      state = r0.state;

      // Chunk 2 before chunk 1 — both accumulate fine
      const r2 = ingestChunk(state, toEntries([makeAircraft("A3")]), 2, 3);
      expect(r2.flushed).toBeNull();
      state = r2.state;
      expect(state.buffer.size).toBe(2);

      const r1 = ingestChunk(state, toEntries([makeAircraft("A2")]), 1, 3);
      expect(r1.flushed).not.toBeNull();
      expect(r1.flushed!.size).toBe(3);
    });
  });

  describe("duplicate ICAOs across chunks", () => {
    it("later chunk overwrites earlier data for same ICAO", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();

      const r0 = ingestChunk(
        state,
        toEntries([makeAircraft("A1", { lat: 10 })]),
        0,
        2,
      );
      state = r0.state;

      const r1 = ingestChunk(
        state,
        toEntries([makeAircraft("A1", { lat: 20 })]),
        1,
        2,
      );
      expect(r1.flushed).not.toBeNull();
      expect(r1.flushed!.size).toBe(1);
      expect(r1.flushed!.get("A1")!.lat).toBe(20);
    });
  });

  describe("state reset after flush", () => {
    it("returns empty state after successful flush", () => {
      const state = createEmptyBatchState<string, AircraftPosition>();
      const result = ingestChunk(state, toEntries([makeAircraft("A1")]), 0, 1);

      expect(result.state.buffer.size).toBe(0);
      expect(result.state.receivedChunks.size).toBe(0);
      expect(result.state.expectedChunks).toBe(0);
    });
  });

  describe("large batch simulation", () => {
    it("correctly accumulates 20 chunks of 100 aircraft each", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();
      const TOTAL_CHUNKS = 20;
      const CHUNK_SIZE = 100;

      for (let c = 0; c < TOTAL_CHUNKS; c++) {
        const chunk = Array.from({ length: CHUNK_SIZE }, (_, i) =>
          makeAircraft(`AC_${c * CHUNK_SIZE + i}`),
        );
        const result = ingestChunk(state, toEntries(chunk), c, TOTAL_CHUNKS);

        if (c < TOTAL_CHUNKS - 1) {
          expect(result.flushed).toBeNull();
          expect(result.state.buffer.size).toBe((c + 1) * CHUNK_SIZE);
        } else {
          expect(result.flushed).not.toBeNull();
          expect(result.flushed!.size).toBe(TOTAL_CHUNKS * CHUNK_SIZE);
        }

        state = result.state;
      }
    });

    it("back-to-back full cycles produce correct flushes", () => {
      let state = createEmptyBatchState<string, AircraftPosition>();
      const flushes: Map<string, AircraftPosition>[] = [];

      for (let cycle = 0; cycle < 3; cycle++) {
        for (let c = 0; c < 5; c++) {
          const chunk = Array.from({ length: 10 }, (_, i) =>
            makeAircraft(`CYCLE${cycle}_${c * 10 + i}`),
          );
          const result = ingestChunk(state, toEntries(chunk), c, 5);
          if (result.flushed) flushes.push(result.flushed);
          state = result.state;
        }
      }

      expect(flushes).toHaveLength(3);
      expect(flushes[0].size).toBe(50);
      expect(flushes[1].size).toBe(50);
      expect(flushes[2].size).toBe(50);

      expect(flushes[0].has("CYCLE0_0")).toBe(true);
      expect(flushes[0].has("CYCLE1_0")).toBe(false);
      expect(flushes[1].has("CYCLE1_0")).toBe(true);
      expect(flushes[2].has("CYCLE2_0")).toBe(true);
    });
  });
});
