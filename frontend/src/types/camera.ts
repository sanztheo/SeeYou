export type StreamType = "Mjpeg" | "ImageRefresh" | "Hls";

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
}

export interface CameraFilter {
  enabled: boolean;
  cities: Set<string>;
}
