export interface Earthquake {
  id: string;
  title: string;
  magnitude: number;
  lat: number;
  lon: number;
  depth_km: number;
  time: string;
  url?: string;
  felt?: number;
  tsunami: boolean;
}

export interface SeismicResponse {
  earthquakes: Earthquake[];
  fetched_at: string;
}

export interface SeismicFilter {
  enabled: boolean;
  minMagnitude: number;
}
