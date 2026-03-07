export interface FireHotspot {
  id?: string;
  lat: number;
  lon: number;
  brightness: number;
  confidence: string;
  frp: number;
  daynight: string;
  acq_date: string;
  acq_time: string;
  satellite: string;
}

export interface FiresResponse {
  fires: FireHotspot[];
  fetched_at: string;
}

export interface FiresFilter {
  enabled: boolean;
  minConfidence: string;
}
