import { describe, it, expect } from "vitest";
import type { WeatherPoint, WeatherGrid, WeatherFilter } from "./weather";

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

  it("WeatherFilter has enabled, showWind, showTemperature, showClouds", () => {
    const filter: WeatherFilter = {
      enabled: false,
      showWind: true,
      showTemperature: true,
      showClouds: true,
    };
    expect(filter.enabled).toBe(false);
    expect(filter.showWind).toBe(true);
    expect(filter.showTemperature).toBe(true);
    expect(filter.showClouds).toBe(true);
  });
});
