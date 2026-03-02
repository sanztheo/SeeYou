import { API_URL } from "../lib/constants";
import type {
  BoundingBox,
  FlowSegment,
  TrafficIncident,
  RouteResult,
} from "../types/traffic";

// ---------------------------------------------------------------------------
// TomTom Tiles URL
// ---------------------------------------------------------------------------

interface TilesUrlResponse {
  flow_url: string;
  incidents_url: string;
}

let _tilesUrlCache: TilesUrlResponse | null = null;

export async function fetchTomTomTilesUrl(
  signal?: AbortSignal,
): Promise<TilesUrlResponse | null> {
  if (_tilesUrlCache) return _tilesUrlCache;

  const res = await fetch(`${API_URL}/traffic/tiles-url`, { signal });
  if (!res.ok) return null;

  const data: TilesUrlResponse = await res.json();
  _tilesUrlCache = data;
  return data;
}

// ---------------------------------------------------------------------------
// TomTom Flow Segments
// ---------------------------------------------------------------------------

interface FlowResponse {
  segments: FlowSegment[];
}

export async function fetchFlowSegments(
  bbox: BoundingBox,
  signal?: AbortSignal,
): Promise<FlowSegment[]> {
  const url = new URL(`${API_URL}/traffic/flow`);
  url.searchParams.set("south", String(bbox.south));
  url.searchParams.set("west", String(bbox.west));
  url.searchParams.set("north", String(bbox.north));
  url.searchParams.set("east", String(bbox.east));

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`[Traffic] flow fetch failed: ${res.status}`);

  const data: FlowResponse = await res.json();
  return data.segments;
}

// ---------------------------------------------------------------------------
// TomTom Incidents
// ---------------------------------------------------------------------------

interface IncidentsResponse {
  incidents: TrafficIncident[];
}

export async function fetchIncidents(
  bbox: BoundingBox,
  signal?: AbortSignal,
): Promise<TrafficIncident[]> {
  const url = new URL(`${API_URL}/traffic/incidents`);
  url.searchParams.set("south", String(bbox.south));
  url.searchParams.set("west", String(bbox.west));
  url.searchParams.set("north", String(bbox.north));
  url.searchParams.set("east", String(bbox.east));

  const res = await fetch(url.toString(), { signal });
  if (!res.ok)
    throw new Error(`[Traffic] incidents fetch failed: ${res.status}`);

  const data: IncidentsResponse = await res.json();
  return data.incidents;
}

// ---------------------------------------------------------------------------
// TomTom Routing
// ---------------------------------------------------------------------------

interface RouteResponse {
  routes: RouteResult[];
}

export async function fetchRoute(
  origin: [number, number],
  destination: [number, number],
  alternatives = true,
  signal?: AbortSignal,
): Promise<RouteResult[]> {
  const res = await fetch(`${API_URL}/traffic/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, alternatives }),
    signal,
  });
  if (!res.ok) throw new Error(`[Traffic] route fetch failed: ${res.status}`);

  const data: RouteResponse = await res.json();
  return data.routes;
}
