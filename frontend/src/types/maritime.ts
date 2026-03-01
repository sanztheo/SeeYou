export interface Vessel {
  mmsi: string;
  name: string | null;
  imo: string | null;
  vessel_type: string;
  lat: number;
  lon: number;
  speed_knots: number | null;
  heading: number | null;
  destination: string | null;
  flag: string | null;
  is_sanctioned: boolean;
}

export interface MaritimeResponse {
  vessels: Vessel[];
  fetched_at: string;
}

export interface MaritimeFilter {
  enabled: boolean;
  sanctionedOnly: boolean;
}
