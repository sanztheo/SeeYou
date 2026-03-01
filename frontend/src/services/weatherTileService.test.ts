import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRainViewerData = {
  version: "2.0",
  generated: 1772381133,
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: [
      { time: 1772373600, path: "/v2/radar/1772373600" },
      { time: 1772374200, path: "/v2/radar/1772374200" },
    ],
    nowcast: [],
  },
  satellite: {
    infrared: [],
  },
};

describe("weatherTileService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fetches RainViewer data from API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRainViewerData),
      }),
    );

    const { fetchRainViewerFrames, _resetCacheForTests } =
      await import("./weatherTileService");
    _resetCacheForTests();
    const result = await fetchRainViewerFrames();
    expect(result.version).toBe("2.0");
    expect(result.host).toBe("https://tilecache.rainviewer.com");
    expect(result.radar.past).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.rainviewer.com/public/weather-maps.json",
      expect.anything(),
    );
  });

  it("returns cached data on second call within TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRainViewerData),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchRainViewerFrames, _resetCacheForTests } =
      await import("./weatherTileService");
    _resetCacheForTests();

    await fetchRainViewerFrames();
    await fetchRainViewerFrames();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after cache TTL expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRainViewerData),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const { fetchRainViewerFrames, _resetCacheForTests } =
      await import("./weatherTileService");
    _resetCacheForTests();

    await fetchRainViewerFrames();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6 * 60 * 1000);
    await fetchRainViewerFrames();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const { fetchRainViewerFrames, _resetCacheForTests } =
      await import("./weatherTileService");
    _resetCacheForTests();
    await expect(fetchRainViewerFrames()).rejects.toThrow("500");
  });

  it("passes abort signal to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRainViewerData),
      }),
    );

    const { fetchRainViewerFrames, _resetCacheForTests } =
      await import("./weatherTileService");
    _resetCacheForTests();
    const controller = new AbortController();
    await fetchRainViewerFrames(controller.signal);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
