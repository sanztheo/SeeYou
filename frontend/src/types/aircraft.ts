export interface AircraftPosition {
  icao: string;
  callsign: string | null;
  aircraft_type: string | null;
  lat: number;
  lon: number;
  altitude_m: number;
  speed_ms: number;
  heading: number;
  vertical_rate_ms: number;
  on_ground: boolean;
  is_military: boolean;
}

export interface AircraftFilter {
  showCivilian: boolean;
  showMilitary: boolean;
}
