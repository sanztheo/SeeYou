import { API_URL } from "../lib/constants";
import type { MilitaryBase } from "../types/military";

export async function fetchMilitaryBases(
  signal?: AbortSignal,
): Promise<MilitaryBase[]> {
  const res = await fetch(`${API_URL}/military-bases`, { signal });
  if (!res.ok) throw new Error(`Military bases fetch failed: ${res.status}`);
  return res.json();
}
