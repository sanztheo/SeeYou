import { API_URL } from "../lib/constants";
import type { FiresResponse } from "../types/fires";

export async function fetchFires(signal?: AbortSignal): Promise<FiresResponse> {
  const res = await fetch(`${API_URL}/fires`, { signal });
  if (!res.ok) throw new Error(`Fires fetch failed: ${res.status}`);
  return res.json();
}
