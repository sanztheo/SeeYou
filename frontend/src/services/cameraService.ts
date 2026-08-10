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

// Keep the progressive protocol but use large pages so cached camera snapshots
// appear almost instantly in the UI.
const CHUNK_SIZE = 20000;

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

// A bbox spanning more than this many degrees of longitude is effectively a
// "world view" — filtering by it would fetch close to everything, defeating
// the point of a bbox. Treated the same as no bbox at all (P0-4 clamp).
const WORLD_VIEW_LON_SPAN_DEG = 90;

export function isWorldViewBbox(bbox: BBox): boolean {
  return bbox.east - bbox.west > WORLD_VIEW_LON_SPAN_DEG;
}

/**
 * Resolves the bbox to fetch cameras for from the latest viewport rectangle.
 * `viewer.camera.computeViewRectangle()` returns undefined when the horizon
 * is visible (tilted/zoomed-out view), and can return a valid but
 * world-spanning rectangle when zoomed all the way out — both cases fall
 * back to `lastValid` (the last known non-world-view bbox), or undefined
 * (limit-only fetch) if none exists yet.
 */
export function resolveCameraBbox(
  current: BBox | null,
  lastValid: BBox | undefined,
): BBox | undefined {
  if (current && !isWorldViewBbox(current)) return current;
  return lastValid;
}
