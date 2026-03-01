export interface MetarStation {
  station_id: string;
  lat: number;
  lon: number;
  temp_c: number | null;
  dewpoint_c: number | null;
  wind_dir_deg: number | null;
  wind_speed_kt: number | null;
  wind_gust_kt: number | null;
  visibility_m: number | null;
  ceiling_ft: number | null;
  flight_category: string;
  raw_metar: string;
}

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

export interface MetarFilter {
  enabled: boolean;
  categories: Set<FlightCategory>;
}

export const FLIGHT_CATEGORY_COLORS: Record<FlightCategory, string> = {
  VFR: "#22C55E",
  MVFR: "#3B82F6",
  IFR: "#EF4444",
  LIFR: "#EC4899",
};

export const ALL_FLIGHT_CATEGORIES: FlightCategory[] = [
  "VFR",
  "MVFR",
  "IFR",
  "LIFR",
];
