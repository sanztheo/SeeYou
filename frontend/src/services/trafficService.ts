import { API_URL } from "../lib/constants";
import type { BoundingBox, Road } from "../types/traffic";

function bboxKey(bbox: BoundingBox): string {
  return [
    bbox.south.toFixed(2),
    bbox.west.toFixed(2),
    bbox.north.toFixed(2),
    bbox.east.toFixed(2),
  ].join(",");
}

let cachedKey = "";
let cachedRoads: Road[] = [];

export async function fetchRoads(bbox: BoundingBox): Promise<Road[]> {
  const key = bboxKey(bbox);
  if (key === cachedKey) return cachedRoads;

  try {
    const params = new URLSearchParams({
      south: String(bbox.south),
      west: String(bbox.west),
      north: String(bbox.north),
      east: String(bbox.east),
    });

    const res = await fetch(`${API_URL}/roads?${params}`);

    if (!res.ok) {
      console.warn(`[Traffic] fetch failed: ${res.status}`);
      return [];
    }

    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null || !("roads" in data)) {
      return [];
    }

    const roads = (data as { roads: Road[] }).roads;
    cachedKey = key;
    cachedRoads = roads;
    return roads;
  } catch (err) {
    console.warn("[Traffic] fetch error:", err);
    return [];
  }
}
