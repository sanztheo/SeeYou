import { API_URL } from "../lib/constants";
import type { GraphSearchResult, GraphSnapshot } from "../types/graph";

async function parseJson<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`${context} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchGraphEntity(
  table: string,
  id: string,
  signal?: AbortSignal,
): Promise<GraphSnapshot> {
  const url = `${API_URL}/graph/entity/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
  const res = await fetch(url, { signal });
  return parseJson<GraphSnapshot>(res, "graph entity");
}

export async function fetchGraphNeighbors(
  table: string,
  id: string,
  depth: 1 | 2,
  signal?: AbortSignal,
): Promise<GraphSnapshot> {
  const params = new URLSearchParams({ depth: String(depth) });
  const url = `${API_URL}/graph/neighbors/${encodeURIComponent(table)}/${encodeURIComponent(id)}?${params.toString()}`;
  const res = await fetch(url, { signal });
  return parseJson<GraphSnapshot>(res, "graph neighbors");
}

export async function fetchGraphZone(
  zoneId: string,
  signal?: AbortSignal,
): Promise<GraphSnapshot> {
  const url = `${API_URL}/graph/zone/${encodeURIComponent(zoneId)}`;
  const res = await fetch(url, { signal });
  return parseJson<GraphSnapshot>(res, "graph zone");
}

export async function searchGraph(
  query: string,
  signal?: AbortSignal,
): Promise<GraphSearchResult[]> {
  const params = new URLSearchParams({ q: query.trim(), limit: "25" });
  const url = `${API_URL}/graph/search?${params.toString()}`;
  const res = await fetch(url, { signal });
  return parseJson<GraphSearchResult[]>(res, "graph search");
}
