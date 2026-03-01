export interface AuroraPoint {
  lat: number;
  lon: number;
  probability: number;
}

export interface SpaceWeatherAlert {
  product_id: string;
  issue_time: string;
  message: string;
}

export interface SpaceWeatherResponse {
  aurora: AuroraPoint[];
  kp_index: number;
  alerts: SpaceWeatherAlert[];
  fetched_at: string;
}

export interface SpaceWeatherFilter {
  enabled: boolean;
}
