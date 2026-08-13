// Mirror of `GET /aircraft/:icao/cameras` (SeeYou v2 P2, Lot 6) —
// backend/crates/api/src/aircraft_cameras.rs.

export type OpticalLevel = "recognition" | "detection" | "proximity";

export interface CameraSightingGeometry {
  bearing_deg: number;
  elevation_deg: number;
  horizontal_distance_m: number;
  slant_distance_m: number;
}

export interface CameraSighting {
  camera_id: string;
  camera_name: string;
  source: string;
  level: OpticalLevel;
  /** 0-1, blends optical level with weather confidence. */
  score: number;
  geometry: CameraSightingGeometry;
  explain: string[];
}

export interface PredictedCameraSighting {
  camera_id: string;
  camera_name: string;
  source: string;
  /** Best (highest-score) optical level reached during the window. */
  level: OpticalLevel;
  /** Seconds from now until this camera first sees the aircraft. */
  t_minus_secs: number;
  /** How long the window lasts, in seconds. */
  duration_secs: number;
  geometry: CameraSightingGeometry;
  explain: string[];
}

export type CameraCoverageFilterReason = "cruise_altitude";

export interface AircraftCamerasResponse {
  icao: string;
  /** "imm" (tracked military) or "cv_coldstart" (everything else). */
  model: string;
  current_altitude_m: number;
  seeing_now: CameraSighting[];
  will_see: PredictedCameraSighting[];
  filtered_reason: CameraCoverageFilterReason | null;
  notes: string[];
}
