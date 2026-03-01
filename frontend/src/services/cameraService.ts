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

export interface CameraProgress {
  loaded: number;
  total: number;
  done: boolean;
}

const CHUNK_SIZE = 100;

export async function fetchCamerasChunked(
  bbox: BBox | undefined,
  onChunk: (cameras: Camera[], progress: CameraProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  let offset = 0;
  const accumulated: Camera[] = [];

  while (true) {
    if (signal?.aborted) return;

    const url = new URL(`${API_URL}/cameras`);
    if (bbox) {
      url.searchParams.set("south", String(bbox.south));
      url.searchParams.set("west", String(bbox.west));
      url.searchParams.set("north", String(bbox.north));
      url.searchParams.set("east", String(bbox.east));
    }
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(CHUNK_SIZE));

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) throw new Error(`Camera fetch failed: ${res.status}`);

    const data: CamerasResponse = await res.json();
    accumulated.push(...data.cameras);

    const done = accumulated.length >= data.total || data.cameras.length === 0;

    onChunk([...accumulated], {
      loaded: accumulated.length,
      total: data.total,
      done,
    });

    if (done) break;
    offset += CHUNK_SIZE;
  }
}

export function getProxyUrl(streamUrl: string): string {
  return `${API_URL}/cameras/proxy?url=${encodeURIComponent(streamUrl)}`;
}
