import { API_URL } from "../lib/constants";
import type { CablesResponse } from "../types/cables";

export async function fetchCables(
  signal?: AbortSignal,
): Promise<CablesResponse> {
  const res = await fetch(`${API_URL}/cables`, { signal });
  if (!res.ok) throw new Error(`Cables fetch failed: ${res.status}`);
  return res.json();
}
