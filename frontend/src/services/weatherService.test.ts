import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/constants", () => ({
  API_URL: "http://test-api",
}));

describe("weatherService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fetches weather data from API", async () => {
    const mockGrid = {
      points: [
        {
          lat: 48.85,
          lon: 2.35,
          temperature_c: 20,
          wind_speed_ms: 5,
          wind_direction_deg: 180,
          pressure_hpa: 1013,
          cloud_cover_pct: 50,
          precipitation_mm: 0,
          humidity_pct: 65,
        },
      ],
      fetched_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGrid),
      }),
    );

    const { fetchWeather } = await import("./weatherService");
    const result = await fetchWeather();
    expect(result.points).toHaveLength(1);
    expect(result.points[0].temperature_c).toBe(20);
    expect(fetch).toHaveBeenCalledWith(
      "http://test-api/weather",
      expect.anything(),
    );
  });

  it("throws on non-ok response with status code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const { fetchWeather } = await import("./weatherService");
    await expect(fetchWeather()).rejects.toThrow("503");
  });

  it("passes abort signal to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ points: [], fetched_at: "" }),
      }),
    );
    const controller = new AbortController();
    const { fetchWeather } = await import("./weatherService");
    await fetchWeather(controller.signal);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("returns empty points array when API returns none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ points: [], fetched_at: "2026-01-01T00:00:00Z" }),
      }),
    );
    const { fetchWeather } = await import("./weatherService");
    const result = await fetchWeather();
    expect(result.points).toEqual([]);
    expect(result.fetched_at).toBe("2026-01-01T00:00:00Z");
  });
});
