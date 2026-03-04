import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/constants", () => ({
  API_URL: "http://test-api",
}));

let fetchCallCount = 0;

function mockFetchOk(results: unknown[]) {
  fetchCallCount++;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results }),
    }),
  );
}

describe("geocodeService", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    fetchCallCount = 0;
  });

  it("returns empty array for queries shorter than 2 chars", async () => {
    const { geocodeSearch } = await import("./geocodeService");
    expect(await geocodeSearch("a")).toEqual([]);
    expect(await geocodeSearch("")).toEqual([]);
    expect(await geocodeSearch(" ")).toEqual([]);
  });

  it("fetches from API and caches result", async () => {
    const results = [
      {
        name: "Paris",
        display_name: "Paris, France",
        lat: 48.85,
        lon: 2.35,
        place_type: "city",
      },
    ];
    mockFetchOk(results);

    const { geocodeSearch } = await import("./geocodeService");

    const first = await geocodeSearch("Paris");
    expect(first).toEqual(results);
    expect(fetch).toHaveBeenCalledTimes(1);

    const second = await geocodeSearch("Paris");
    expect(second).toEqual(results);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cache is case-insensitive", async () => {
    const results = [
      {
        name: "London",
        display_name: "London, UK",
        lat: 51.5,
        lon: -0.12,
        place_type: "city",
      },
    ];
    mockFetchOk(results);

    const { geocodeSearch } = await import("./geocodeService");

    await geocodeSearch("London");
    const cached = await geocodeSearch("london");
    expect(cached).toEqual(results);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("evicts oldest entry when cache exceeds MAX_CACHE (64)", async () => {
    const { geocodeSearch } = await import("./geocodeService");

    const singleMock = vi.fn();
    for (let i = 0; i < 65; i++) {
      const name = `city_${String(i).padStart(3, "0")}`;
      singleMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { name, display_name: name, lat: i, lon: i, place_type: "city" },
            ],
          }),
      });
    }
    singleMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
    vi.stubGlobal("fetch", singleMock);

    for (let i = 0; i < 65; i++) {
      await geocodeSearch(`city_${String(i).padStart(3, "0")}`);
    }

    expect(singleMock).toHaveBeenCalledTimes(65);

    // city_000 was the first inserted — should have been evicted
    await geocodeSearch("city_000");
    expect(singleMock).toHaveBeenCalledTimes(66);
  });

  it("returns empty array on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502 }),
    );

    const { geocodeSearch } = await import("./geocodeService");
    const result = await geocodeSearch("Unknown");
    expect(result).toEqual([]);
  });

  it("uses close zoom altitude for address-like results", async () => {
    const { geocodeFlyToAltitude } = await import("./geocodeService");
    expect(geocodeFlyToAltitude("house")).toBe(1200);
    expect(geocodeFlyToAltitude("building")).toBe(1200);
    expect(geocodeFlyToAltitude("road")).toBe(2500);
  });

  it("uses wider zoom altitude for city-like results", async () => {
    const { geocodeFlyToAltitude } = await import("./geocodeService");
    expect(geocodeFlyToAltitude("city")).toBe(50000);
    expect(geocodeFlyToAltitude("country")).toBe(120000);
  });
});
