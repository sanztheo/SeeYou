import { API_URL } from "../lib/constants";
import type { BoundingBox, Road } from "../types/traffic";
import { bboxKey, bboxContains } from "../components/Traffic/trafficUtils";

const LRU_MAX = 8;

interface CacheEntry {
  bbox: BoundingBox;
  key: string;
  roads: Road[];
  ts: number;
}

const cache: CacheEntry[] = [];

function findCovering(bbox: BoundingBox): CacheEntry | undefined {
  return cache.find((e) => bboxContains(e.bbox, bbox));
}

function pushCache(bbox: BoundingBox, roads: Road[]): void {
  const key = bboxKey(bbox);
  const existing = cache.findIndex((e) => e.key === key);
  if (existing >= 0) cache.splice(existing, 1);
  cache.push({ bbox, key, roads, ts: Date.now() });
  while (cache.length > LRU_MAX) cache.shift();
}

export interface RoadChunkProgress {
  loaded: number;
  total: number;
  done: boolean;
}

interface RoadsResponse {
  roads: Road[];
  total: number;
}

const ROAD_CHUNK_SIZE = 100;

export async function fetchRoadsChunked(
  bbox: BoundingBox,
  onChunk: (roads: Road[], progress: RoadChunkProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const hit = findCovering(bbox);
  if (hit) {
    hit.ts = Date.now();
    onChunk(hit.roads, {
      loaded: hit.roads.length,
      total: hit.roads.length,
      done: true,
    });
    return;
  }

  const exact = cache.find((e) => e.key === bboxKey(bbox));
  if (exact) {
    exact.ts = Date.now();
    onChunk(exact.roads, {
      loaded: exact.roads.length,
      total: exact.roads.length,
      done: true,
    });
    return;
  }

  let offset = 0;
  const accumulated: Road[] = [];

  while (true) {
    if (signal?.aborted) return;

    const url = new URL(`${API_URL}/roads`);
    url.searchParams.set("south", String(bbox.south));
    url.searchParams.set("west", String(bbox.west));
    url.searchParams.set("north", String(bbox.north));
    url.searchParams.set("east", String(bbox.east));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(ROAD_CHUNK_SIZE));

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      console.warn(`[Traffic] fetch failed: ${res.status}`);
      return;
    }

    const data: RoadsResponse = await res.json();
    accumulated.push(...data.roads);

    const done = accumulated.length >= data.total || data.roads.length === 0;

    onChunk([...accumulated], {
      loaded: accumulated.length,
      total: data.total,
      done,
    });

    if (done) {
      pushCache(bbox, accumulated);
      break;
    }

    offset += ROAD_CHUNK_SIZE;
  }
}

export function getCachedRoads(bbox: BoundingBox): Road[] | null {
  const hit = findCovering(bbox);
  if (hit) return hit.roads;
  const exact = cache.find((e) => e.key === bboxKey(bbox));
  return exact?.roads ?? null;
}
