import { API_URL } from "../lib/constants";
import type { SpaceWeatherResponse } from "../types/spaceWeather";

export async function fetchSpaceWeather(
  signal?: AbortSignal,
): Promise<SpaceWeatherResponse> {
  const res = await fetch(`${API_URL}/space-weather`, { signal });
  if (!res.ok) throw new Error(`Space weather fetch failed: ${res.status}`);
  return res.json();
}
