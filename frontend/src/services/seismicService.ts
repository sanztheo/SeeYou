import { API_URL } from "../lib/constants";
import type { SeismicResponse } from "../types/seismic";

export async function fetchSeismic(
  signal?: AbortSignal,
): Promise<SeismicResponse> {
  const res = await fetch(`${API_URL}/seismic`, { signal });
  if (!res.ok) throw new Error(`Seismic fetch failed: ${res.status}`);
  return res.json();
}
