import { API_URL } from "../lib/constants";
import type { Camera } from "../types/camera";

interface CamerasResponse {
  cameras: Camera[];
  total: number;
}

let cached: Camera[] | null = null;

export async function fetchCameras(): Promise<Camera[]> {
  if (cached) return cached;

  const res = await fetch(`${API_URL}/cameras`);
  if (!res.ok) throw new Error(`Failed to fetch cameras: ${res.status}`);

  const data: CamerasResponse = await res.json();
  cached = data.cameras;
  return cached;
}

export function invalidateCameraCache(): void {
  cached = null;
}

export function getProxyUrl(streamUrl: string): string {
  return `${API_URL}/cameras/proxy?url=${encodeURIComponent(streamUrl)}`;
}
