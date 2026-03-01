export interface WeatherPoint {
  lat: number;
  lon: number;
  temperature_c: number;
  wind_speed_ms: number;
  wind_direction_deg: number;
  pressure_hpa: number;
  cloud_cover_pct: number;
  precipitation_mm: number;
  humidity_pct: number;
}

export interface WeatherGrid {
  points: WeatherPoint[];
  fetched_at: string;
}

export interface WeatherFilter {
  enabled: boolean;
  showWind: boolean;
  showTemperature: boolean;
  showClouds: boolean;
}
