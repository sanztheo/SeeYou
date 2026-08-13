export type StreamType = "Mjpeg" | "ImageRefresh" | "Hls";
export type CameraViewSource = "provider" | "parsed" | "estimated";

export interface Camera {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
  source: string;
  stream_url: string;
  stream_type: StreamType;
  is_online: boolean;
  view_heading_deg?: number;
  view_fov_deg?: number;
  view_heading_source?: CameraViewSource;
  view_hint?: string;
  /** Sensor horizontal resolution in pixels — no provider populates this
   * yet; absent means the backend falls back to a conservative default
   * (SeeYou v2 P2, camera↔aircraft pixel criterion). */
  resolution_px?: number;
}

export interface CameraFilter {
  enabled: boolean;
  cities: Set<string>;
  sources: Set<string>;
}
