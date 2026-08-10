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

/** `lat`/`lon` are rounded to 5 decimals (~1.1 m) and `alt_m` to the metre —
 * wire payload reduction (SeeYou v2 P0-2). No per-point timestamp or
 * uncertainty: both derive from the trajectory-level `step_secs` /
 * `sigma_growth_m_s` (point `i`, 0-based, is `(i + 1) * step_secs` seconds
 * from now). */
export interface PredictedPoint {
  lat: number;
  lon: number;
  alt_m: number;
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
  /** Seconds between consecutive points. */
  step_secs: number;
  /** Combined horizontal+vertical 1-sigma uncertainty growth rate (m/s):
   * sigma at point `i` (0-based) ≈ `sigma_growth_m_s * (i + 1) * step_secs`.
   * `0` for a cold-start trajectory, which tracks no covariance. */
  sigma_growth_m_s: number;
  pattern: MilitaryPattern | null;
  model_probabilities: [number, number, number, number];
  /** "imm" for a tracked military aircraft, "cv_coldstart" for a
   * straight-line + vertical-rate projection from last known kinematics. */
  model: string;
}
