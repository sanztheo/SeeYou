import { API_URL } from "../lib/constants";
import type { WeatherGrid } from "../types/weather";

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherGrid> {
  const res = await fetch(`${API_URL}/weather`, { signal });
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  return res.json();
}
