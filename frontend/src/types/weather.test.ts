import { describe, it, expect } from "vitest";
import type {
  WeatherPoint,
  WeatherGrid,
  WeatherFilter,
  RainViewerFrame,
  RainViewerData,
} from "./weather";

describe("weather types", () => {
  it("WeatherPoint has all required numeric fields", () => {
    const point: WeatherPoint = {
      lat: 48.85,
      lon: 2.35,
      temperature_c: 15,
      wind_speed_ms: 3.2,
      wind_direction_deg: 270,
      pressure_hpa: 1013.25,
      cloud_cover_pct: 40,
      precipitation_mm: 0.5,
      humidity_pct: 72,
    };
    expect(point.lat).toBe(48.85);
    expect(point.wind_speed_ms).toBe(3.2);
    expect(point.humidity_pct).toBe(72);
  });

  it("WeatherGrid holds points and fetched_at timestamp", () => {
    const grid: WeatherGrid = {
      points: [
        {
          lat: 0,
          lon: 0,
          temperature_c: 0,
          wind_speed_ms: 0,
          wind_direction_deg: 0,
          pressure_hpa: 0,
          cloud_cover_pct: 0,
          precipitation_mm: 0,
          humidity_pct: 0,
        },
      ],
      fetched_at: "2026-01-01T00:00:00Z",
    };
    expect(grid.points).toHaveLength(1);
    expect(grid.fetched_at).toBe("2026-01-01T00:00:00Z");
  });

  it("WeatherFilter has enabled, showRadar, showWind, opacity and animation", () => {
    const filter: WeatherFilter = {
      enabled: false,
      showRadar: true,
      showWind: true,
      radarOpacity: 0.7,
      windOpacity: 0.6,
      animationSpeed: 500,
    };
    expect(filter.enabled).toBe(false);
    expect(filter.showRadar).toBe(true);
    expect(filter.showWind).toBe(true);
    expect(filter.radarOpacity).toBe(0.7);
    expect(filter.windOpacity).toBe(0.6);
    expect(filter.animationSpeed).toBe(500);
  });

  it("RainViewerFrame has time and path", () => {
    const frame: RainViewerFrame = {
      time: 1772373600,
      path: "/v2/radar/1772373600",
    };
    expect(frame.time).toBe(1772373600);
    expect(frame.path).toBe("/v2/radar/1772373600");
  });

  it("RainViewerData has version, generated, host, radar and satellite", () => {
    const data: RainViewerData = {
      version: "2.0",
      generated: 1772381133,
      host: "https://tilecache.rainviewer.com",
      radar: {
        past: [{ time: 1772373600, path: "/v2/radar/1772373600" }],
        nowcast: [],
      },
      satellite: {
        infrared: [],
      },
    };
    expect(data.version).toBe("2.0");
    expect(data.generated).toBe(1772381133);
    expect(data.host).toBe("https://tilecache.rainviewer.com");
    expect(data.radar.past).toHaveLength(1);
    expect(data.radar.nowcast).toEqual([]);
    expect(data.satellite.infrared).toEqual([]);
  });
});
