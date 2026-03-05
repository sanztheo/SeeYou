import { API_URL } from "../lib/constants";
import type { SatellitePosition } from "../types/satellite";

export async function fetchSatellites(
  signal?: AbortSignal,
): Promise<SatellitePosition[]> {
  const res = await fetch(`${API_URL}/satellites`, { signal });
  if (res.status === 503) return [];
  if (!res.ok) throw new Error(`Satellites fetch failed: ${res.status}`);
  return res.json();
}
