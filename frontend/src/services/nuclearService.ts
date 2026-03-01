import { API_URL } from "../lib/constants";
import type { NuclearSite } from "../types/nuclear";

export async function fetchNuclearSites(
  signal?: AbortSignal,
): Promise<NuclearSite[]> {
  const res = await fetch(`${API_URL}/nuclear-sites`, { signal });
  if (!res.ok) throw new Error(`Nuclear sites fetch failed: ${res.status}`);
  return res.json();
}
