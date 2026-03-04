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
}

export interface CameraFilter {
  enabled: boolean;
  cities: Set<string>;
  sources: Set<string>;
}
