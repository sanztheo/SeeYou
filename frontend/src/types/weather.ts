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
  showRadar: boolean;
  showWind: boolean;
  radarOpacity: number;
  windOpacity: number;
  animationSpeed: number;
}

export interface RainViewerFrame {
  time: number;
  path: string;
}

export interface RainViewerData {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: RainViewerFrame[];
    nowcast: RainViewerFrame[];
  };
  satellite: {
    infrared: RainViewerFrame[];
  };
}
