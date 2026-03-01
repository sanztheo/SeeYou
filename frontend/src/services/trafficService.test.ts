import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/constants", () => ({
  API_URL: "http://test-api",
}));

describe("trafficService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("fetchRoadsChunked", () => {
    it("throws on non-ok HTTP response instead of silently returning", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      const { fetchRoadsChunked } = await import("./trafficService");
      const bbox = { south: 10, west: 20, north: 11, east: 21 };
      const onChunk = vi.fn();

      await expect(fetchRoadsChunked(bbox, onChunk)).rejects.toThrow(
        "[Traffic] fetch failed: 500",
      );
      expect(onChunk).not.toHaveBeenCalled();
    });

    it("throws on 404 response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const { fetchRoadsChunked } = await import("./trafficService");
      const bbox = { south: 20, west: 30, north: 21, east: 31 };

      await expect(fetchRoadsChunked(bbox, vi.fn())).rejects.toThrow(
        "[Traffic] fetch failed: 404",
      );
    });

    it("calls onChunk with accumulated roads on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              roads: [
                {
                  id: 1,
                  road_type: "Motorway",
                  name: "A1",
                  nodes: [
                    { lat: 48.1, lon: 2.1 },
                    { lat: 48.2, lon: 2.2 },
                  ],
                  speed_limit_kmh: 130,
                },
              ],
              total: 1,
            }),
        }),
      );

      const { fetchRoadsChunked } = await import("./trafficService");
      const bbox = { south: 30, west: 40, north: 31, east: 41 };
      const onChunk = vi.fn();

      await fetchRoadsChunked(bbox, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      const [roads, progress] = onChunk.mock.calls[0];
      expect(roads).toHaveLength(1);
      expect(roads[0].id).toBe(1);
      expect(progress.done).toBe(true);
      expect(progress.loaded).toBe(1);
      expect(progress.total).toBe(1);
    });

    it("does not fetch when signal is already aborted", async () => {
      const ac = new AbortController();
      ac.abort();

      const mockFn = vi.fn();
      vi.stubGlobal("fetch", mockFn);

      const { fetchRoadsChunked } = await import("./trafficService");
      const bbox = { south: 40, west: 50, north: 41, east: 51 };
      const onChunk = vi.fn();

      await fetchRoadsChunked(bbox, onChunk, ac.signal);

      expect(mockFn).not.toHaveBeenCalled();
      expect(onChunk).not.toHaveBeenCalled();
    });

    it("accumulates multiple chunks progressively", async () => {
      const road1 = {
        id: 1,
        road_type: "Motorway",
        name: "A1",
        nodes: [
          { lat: 48.1, lon: 2.1 },
          { lat: 48.2, lon: 2.2 },
        ],
        speed_limit_kmh: 130,
      };
      const road2 = {
        id: 2,
        road_type: "Primary",
        name: "N7",
        nodes: [
          { lat: 48.3, lon: 2.3 },
          { lat: 48.4, lon: 2.4 },
        ],
        speed_limit_kmh: 90,
      };

      const mockFn = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ roads: [road1], total: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ roads: [road2], total: 2 }),
        });
      vi.stubGlobal("fetch", mockFn);

      const { fetchRoadsChunked } = await import("./trafficService");
      const bbox = { south: 50, west: 60, north: 51, east: 61 };
      const onChunk = vi.fn();

      await fetchRoadsChunked(bbox, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk.mock.calls[0][1]).toEqual({
        loaded: 1,
        total: 2,
        done: false,
      });
      expect(onChunk.mock.calls[1][1]).toEqual({
        loaded: 2,
        total: 2,
        done: true,
      });
      expect(onChunk.mock.calls[1][0]).toHaveLength(2);
    });
  });
});
