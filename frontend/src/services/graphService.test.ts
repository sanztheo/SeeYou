import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchGraphEntity,
  fetchGraphNeighbors,
  fetchGraphZone,
  searchGraph,
} from "./graphService";

describe("graphService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls /graph/neighbors with encoded params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ root: { table: "aircraft", id: "abc" }, nodes: [], edges: [], truncated: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchGraphNeighbors("aircraft", "ab c", 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/graph/neighbors/aircraft/ab%20c");
    expect(url).toContain("depth=2");
  });

  it("throws contextual error on non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGraphEntity("aircraft", "abc")).rejects.toThrow(
      "graph entity failed: 503",
    );
  });

  it("fetches zone and search endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { table: "zone", id: "city-paris" }, nodes: [], edges: [], truncated: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ ref: { table: "zone", id: "city-paris" }, label: "Paris" }]),
      });

    vi.stubGlobal("fetch", fetchMock);

    const zone = await fetchGraphZone("city-paris");
    const results = await searchGraph("paris");

    expect(zone.root.id).toBe("city-paris");
    expect(results[0].label).toBe("Paris");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/graph/zone/city-paris");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/graph/search?q=paris");
  });
});
