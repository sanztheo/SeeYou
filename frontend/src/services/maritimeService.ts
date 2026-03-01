import { API_URL } from "../lib/constants";
import type { MaritimeResponse } from "../types/maritime";

export async function fetchMaritime(
  signal?: AbortSignal,
): Promise<MaritimeResponse> {
  const res = await fetch(`${API_URL}/maritime`, { signal });
  if (!res.ok) throw new Error(`Maritime fetch failed: ${res.status}`);
  return res.json();
}
