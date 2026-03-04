import { API_URL } from "../lib/constants";

export interface GeocodeResult {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  place_type: string;
}

interface GeocodeResponse {
  results: GeocodeResult[];
}

const MAX_CACHE = 64;
const cache = new Map<string, GeocodeResult[]>();

function cacheSet(key: string, value: GeocodeResult[]): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export async function geocodeSearch(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const url = new URL(`${API_URL}/geocode`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) return [];

  const data: GeocodeResponse = await res.json();
  cacheSet(key, data.results);
  return data.results;
}

export function geocodeFlyToAltitude(placeType: string): number {
  const normalized = placeType.trim().toLowerCase();
  if (
    normalized === "house" ||
    normalized === "building" ||
    normalized === "residential" ||
    normalized === "commercial" ||
    normalized === "amenity"
  ) {
    return 1200;
  }
  if (
    normalized === "road" ||
    normalized === "street" ||
    normalized === "pedestrian" ||
    normalized === "service" ||
    normalized === "path"
  ) {
    return 2500;
  }
  if (
    normalized === "suburb" ||
    normalized === "neighbourhood" ||
    normalized === "quarter"
  ) {
    return 6000;
  }
  if (normalized === "village" || normalized === "hamlet" || normalized === "town") {
    return 18000;
  }
  if (normalized === "country" || normalized === "state" || normalized === "province") {
    return 120000;
  }
  return 50000;
}
