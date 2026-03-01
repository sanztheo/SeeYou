import { API_URL } from "../lib/constants";
import type { Camera } from "../types/camera";

interface CamerasResponse {
  cameras: Camera[];
  total: number;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

let inflight: Promise<Camera[]> | null = null;
let inflightKey = "";

export async function fetchCameras(bbox?: BBox): Promise<Camera[]> {
  const key = bbox
    ? `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
    : "__all__";

  if (inflight && inflightKey === key) return inflight;

  const url = new URL(`${API_URL}/cameras`);
  if (bbox) {
    url.searchParams.set("south", String(bbox.south));
    url.searchParams.set("west", String(bbox.west));
    url.searchParams.set("north", String(bbox.north));
    url.searchParams.set("east", String(bbox.east));
  }

  inflightKey = key;
  inflight = fetch(url.toString())
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch cameras: ${res.status}`);
      return res.json() as Promise<CamerasResponse>;
    })
    .then((data) => data.cameras)
    .finally(() => {
      if (inflightKey === key) {
        inflight = null;
        inflightKey = "";
      }
    });

  return inflight;
}

export function getProxyUrl(streamUrl: string): string {
  return `${API_URL}/cameras/proxy?url=${encodeURIComponent(streamUrl)}`;
}
