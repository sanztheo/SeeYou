import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AircraftPosition } from "../../types/aircraft";
import type { SatellitePosition } from "../../types/satellite";
import type { Camera } from "../../types/camera";
import {
  geocodeSearch,
  type GeocodeResult,
} from "../../services/geocodeService";

interface SearchBarProps {
  aircraft: Map<string, AircraftPosition>;
  satellites: Map<number, SatellitePosition>;
  cameras: Camera[];
  onSelectAircraft?: (ac: AircraftPosition) => void;
  onSelectSatellite?: (sat: SatellitePosition) => void;
  onSelectCamera?: (cam: Camera) => void;
  onFlyToCity?: (lat: number, lon: number, alt: number) => void;
  sidebarOpen?: boolean;
}

const MAX_PER_GROUP = 6;

function matches(haystack: string | null | undefined, query: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(query);
}

export function SearchBar({
  aircraft,
  satellites,
  cameras,
  onSelectAircraft,
  onSelectSatellite,
  onSelectCamera,
  onFlyToCity,
  sidebarOpen,
}: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const geoAbortRef = useRef<AbortController | null>(null);
  const geoTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const q = query.toLowerCase().trim();

  const localResults = useMemo(() => {
    if (!q) return { ac: [], sat: [], cam: [] };

    const ac: AircraftPosition[] = [];
    for (const a of aircraft.values()) {
      if (ac.length >= MAX_PER_GROUP) break;
      if (
        matches(a.callsign, q) ||
        matches(a.icao, q) ||
        matches(a.aircraft_type, q)
      )
        ac.push(a);
    }

    const sat: SatellitePosition[] = [];
    for (const s of satellites.values()) {
      if (sat.length >= MAX_PER_GROUP) break;
      if (
        matches(s.name, q) ||
        matches(String(s.norad_id), q) ||
        matches(s.category, q)
      )
        sat.push(s);
    }

    const cam: Camera[] = [];
    for (const c of cameras) {
      if (cam.length >= MAX_PER_GROUP) break;
      if (matches(c.name, q) || matches(c.city, q) || matches(c.id, q))
        cam.push(c);
    }

    return { ac, sat, cam };
  }, [q, aircraft, satellites, cameras]);

  useEffect(() => {
    if (!q || q.length < 2) {
      setGeoResults([]);
      setGeoLoading(false);
      return;
    }

    setGeoLoading(true);
    if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
    if (geoAbortRef.current) geoAbortRef.current.abort();

    geoTimerRef.current = setTimeout(() => {
      const ac = new AbortController();
      geoAbortRef.current = ac;

      geocodeSearch(q, ac.signal)
        .then((results) => {
          if (!ac.signal.aborted) {
            setGeoResults(results);
            setGeoLoading(false);
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setGeoLoading(false);
        });
    }, 300);

    return () => {
      if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
      if (geoAbortRef.current) geoAbortRef.current.abort();
    };
  }, [q]);

  const hasResults =
    localResults.ac.length +
      localResults.sat.length +
      localResults.cam.length +
      geoResults.length >
    0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = useCallback(
    (
      type: "ac" | "sat" | "cam",
      item: AircraftPosition | SatellitePosition | Camera,
    ) => {
      setOpen(false);
      setQuery("");
      if (type === "ac") onSelectAircraft?.(item as AircraftPosition);
      else if (type === "sat") onSelectSatellite?.(item as SatellitePosition);
      else onSelectCamera?.(item as Camera);
    },
    [onSelectAircraft, onSelectSatellite, onSelectCamera],
  );

  const selectCity = useCallback(
    (result: GeocodeResult) => {
      setOpen(false);
      setQuery("");
      onFlyToCity?.(result.lat, result.lon, 50000);
    },
    [onFlyToCity],
  );

  const leftOffset = sidebarOpen
    ? "left-[calc(280px+50%-(280px/2))]"
    : "left-1/2";

  return (
    <div
      ref={containerRef}
      className={`fixed top-3 ${leftOffset} z-40 w-[340px] -translate-x-1/2`}
    >
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search aircraft, satellites, cities, cameras..."
          className="w-full rounded-md border border-zinc-700/60 bg-zinc-900/80 py-1.5 pl-9 pr-14 font-mono text-[11px] text-zinc-200 placeholder-zinc-600 shadow-lg shadow-black/30 backdrop-blur-xl outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-700/50 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">
          /
        </kbd>
      </div>

      {open && q && (hasResults || geoLoading) && (
        <div className="mt-1 max-h-72 overflow-y-auto rounded-md border border-zinc-700/60 bg-zinc-900/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {geoResults.length > 0 && (
            <Group label="CITIES" count={geoResults.length}>
              {geoResults.map((r, i) => (
                <Row
                  key={`${r.lat}-${r.lon}-${i}`}
                  onClick={() => selectCity(r)}
                >
                  <span className="text-violet-400 font-medium">{r.name}</span>
                  <span className="ml-auto text-zinc-600 text-[9px] truncate max-w-[160px]">
                    {r.display_name.split(",").slice(1, 3).join(",").trim()}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {geoLoading && geoResults.length === 0 && (
            <div className="px-3 py-2">
              <span className="font-mono text-[9px] text-zinc-600 animate-pulse">
                Searching cities...
              </span>
            </div>
          )}
          {localResults.ac.length > 0 && (
            <Group label="AIRCRAFT" count={localResults.ac.length}>
              {localResults.ac.map((a) => (
                <Row key={a.icao} onClick={() => select("ac", a)}>
                  <span className="text-emerald-400 font-medium">
                    {a.callsign || "---"}
                  </span>
                  <span className="text-zinc-600 text-[9px] ml-1.5">
                    {a.aircraft_type || ""}
                  </span>
                  <span className="ml-auto text-zinc-700 text-[9px]">
                    {a.icao}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {localResults.sat.length > 0 && (
            <Group label="SATELLITES" count={localResults.sat.length}>
              {localResults.sat.map((s) => (
                <Row key={s.norad_id} onClick={() => select("sat", s)}>
                  <span className="text-cyan-400 font-medium">{s.name}</span>
                  <span className="text-zinc-600 text-[9px] ml-1.5">
                    {s.category}
                  </span>
                  <span className="ml-auto text-zinc-700 text-[9px]">
                    #{s.norad_id}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {localResults.cam.length > 0 && (
            <Group label="CAMERAS" count={localResults.cam.length}>
              {localResults.cam.map((c) => (
                <Row key={c.id} onClick={() => select("cam", c)}>
                  <span className="text-amber-400 font-medium">{c.name}</span>
                  <span className="ml-auto text-zinc-600 text-[9px]">
                    {c.city}
                  </span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}

      {open && q && !hasResults && !geoLoading && (
        <div className="mt-1 rounded-md border border-zinc-700/60 bg-zinc-900/95 p-3 text-center shadow-2xl backdrop-blur-xl">
          <span className="font-mono text-[10px] text-zinc-600">
            NO RESULTS FOR "{query}"
          </span>
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/50 px-3 py-1">
        <span className="font-mono text-[9px] tracking-widest text-zinc-500">
          {label}
        </span>
        <span className="font-mono text-[9px] text-zinc-700">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Row({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-left transition-colors hover:bg-emerald-500/8"
    >
      {children}
    </button>
  );
}
