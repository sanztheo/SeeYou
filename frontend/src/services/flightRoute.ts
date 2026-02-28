import type { Airport, FlightRoute } from "../types/aircraft";

const ROUTESET_URL = "https://api.adsb.lol/api/0/routeset";

interface AdsbAirport {
  iata: string;
  icao: string;
  lat: number;
  lon: number;
  name: string;
}

interface AdsbRouteEntry {
  airport_codes: string;
  _airports: AdsbAirport[];
  callsign: string;
  plausible: number;
}

const cache = new Map<string, FlightRoute | null>();

function toAirport(raw: AdsbAirport): Airport {
  return {
    iata: raw.iata,
    icao: raw.icao,
    name: raw.name,
    lat: raw.lat,
    lon: raw.lon,
  };
}

function isAdsbAirport(v: unknown): v is AdsbAirport {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.iata === "string" &&
    typeof o.icao === "string" &&
    typeof o.lat === "number" &&
    typeof o.lon === "number" &&
    typeof o.name === "string"
  );
}

function isAdsbRouteEntry(v: unknown): v is AdsbRouteEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.callsign === "string" &&
    typeof o.plausible === "number" &&
    Array.isArray(o._airports) &&
    o._airports.every(isAdsbAirport)
  );
}

export async function fetchFlightRoute(
  callsign: string,
  lat: number,
  lon: number,
): Promise<FlightRoute | null> {
  const key = callsign.trim().toUpperCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(ROUTESET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planes: [{ callsign: key, lat, lng: lon }] }),
    });

    if (!res.ok) {
      cache.set(key, null);
      return null;
    }

    const data: unknown = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      cache.set(key, null);
      return null;
    }

    const entry: unknown = data[0];
    if (!isAdsbRouteEntry(entry) || entry.plausible !== 1) {
      cache.set(key, null);
      return null;
    }

    if (entry._airports.length < 2) {
      cache.set(key, null);
      return null;
    }

    const route: FlightRoute = {
      departure: toAirport(entry._airports[0]),
      arrival: toAirport(entry._airports[entry._airports.length - 1]),
    };

    cache.set(key, route);
    return route;
  } catch {
    cache.set(key, null);
    return null;
  }
}
