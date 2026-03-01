export interface SubmarineCable {
  id: string;
  name: string;
  length_km: number | null;
  owners: string | null;
  year: string | null;
  coordinates: [number, number][];
}

export interface LandingPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country: string | null;
}

export interface CablesResponse {
  cables: SubmarineCable[];
  landing_points: LandingPoint[];
  fetched_at: string;
}

export interface CablesFilter {
  enabled: boolean;
}
