import type { RainViewerData } from "../types/weather";

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

let cachedData: RainViewerData | null = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchRainViewerFrames(
  signal?: AbortSignal,
): Promise<RainViewerData> {
  const now = Date.now();
  if (cachedData && now - lastFetch < CACHE_TTL) return cachedData;

  const res = await fetch(RAINVIEWER_API, { signal });
  if (!res.ok) throw new Error(`RainViewer fetch failed: ${res.status}`);
  const data: RainViewerData = await res.json();
  cachedData = data;
  lastFetch = now;
  return data;
}

export function _resetCacheForTests(): void {
  cachedData = null;
  lastFetch = 0;
}
