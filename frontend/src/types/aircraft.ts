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

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  lat: number;
  lon: number;
}

export interface FlightRoute {
  departure: Airport;
  arrival: Airport;
}

// ── IMM-EKF Prediction types ────────────────────────────────

export interface PredictedPoint {
  lat: number;
  lon: number;
  alt_m: number;
  dt_secs: number;
  sigma_xy_m: number;
  sigma_z_m: number;
}

export type MilitaryPattern =
  | { Orbit: { center_lat: number; center_lon: number; radius_m: number } }
  | {
      Cap: {
        wp1_lat: number;
        wp1_lon: number;
        wp2_lat: number;
        wp2_lon: number;
      };
    }
  | { Transit: { heading_deg: number } }
  | { Holding: { center_lat: number; center_lon: number } };

export interface PredictedTrajectory {
  icao: string;
  points: PredictedPoint[];
  pattern: MilitaryPattern | null;
  model_probabilities: [number, number, number, number];
}
