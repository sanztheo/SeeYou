import { API_URL } from "../lib/constants";
import type { GdeltResponse } from "../types/gdelt";

export async function fetchGdelt(signal?: AbortSignal): Promise<GdeltResponse> {
  const res = await fetch(`${API_URL}/gdelt`, { signal });
  if (!res.ok) throw new Error(`GDELT fetch failed: ${res.status}`);
  return res.json();
}
