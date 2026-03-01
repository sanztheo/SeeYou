import { API_URL } from "../lib/constants";
import type { EventsResponse } from "../types/events";

export async function fetchEvents(
  signal?: AbortSignal,
): Promise<EventsResponse> {
  const res = await fetch(`${API_URL}/events`, { signal });
  if (!res.ok) throw new Error(`Events fetch failed: ${res.status}`);
  return res.json();
}
