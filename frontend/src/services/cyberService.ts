import { API_URL } from "../lib/constants";
import type { CyberResponse } from "../types/cyber";

export async function fetchCyber(signal?: AbortSignal): Promise<CyberResponse> {
  const res = await fetch(`${API_URL}/cyber`, { signal });
  if (!res.ok) throw new Error(`Cyber fetch failed: ${res.status}`);
  return res.json();
}
