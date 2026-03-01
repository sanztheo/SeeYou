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

export interface TrafficProgress {
  loading: boolean;
  roadCount: number;
}

export async function fetchRoads(
  bbox: BoundingBox,
  signal?: AbortSignal,
): Promise<Road[]> {
  const hit = findCovering(bbox);
  if (hit) {
    hit.ts = Date.now();
    return hit.roads;
  }

  const exact = cache.find((e) => e.key === bboxKey(bbox));
  if (exact) {
    exact.ts = Date.now();
    return exact.roads;
  }

  const params = new URLSearchParams({
    south: String(bbox.south),
    west: String(bbox.west),
    north: String(bbox.north),
    east: String(bbox.east),
  });

  const res = await fetch(`${API_URL}/roads?${params}`, { signal });

  if (!res.ok) {
    console.warn(`[Traffic] fetch failed: ${res.status}`);
    return [];
  }

  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null || !("roads" in data)) {
    return [];
  }

  const roads = (data as { roads: Road[] }).roads;
  pushCache(bbox, roads);
  return roads;
}

export function getCachedRoads(bbox: BoundingBox): Road[] | null {
  const hit = findCovering(bbox);
  if (hit) return hit.roads;
  const exact = cache.find((e) => e.key === bboxKey(bbox));
  return exact?.roads ?? null;
}
