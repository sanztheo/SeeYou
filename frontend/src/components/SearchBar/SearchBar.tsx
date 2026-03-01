import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AircraftPosition } from "../../types/aircraft";
import type { SatellitePosition } from "../../types/satellite";
import type { Camera } from "../../types/camera";

interface SearchBarProps {
  aircraft: Map<string, AircraftPosition>;
  satellites: Map<number, SatellitePosition>;
  cameras: Camera[];
  onSelectAircraft?: (ac: AircraftPosition) => void;
  onSelectSatellite?: (sat: SatellitePosition) => void;
  onSelectCamera?: (cam: Camera) => void;
}

const MAX_PER_GROUP = 5;

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
}: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const q = query.toLowerCase().trim();

  const results = useMemo(() => {
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

  const hasResults =
    results.ac.length + results.sat.length + results.cam.length > 0;

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
      ) {
        setOpen(false);
      }
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

  return (
    <div
      ref={containerRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[380px]"
    >
      {/* Input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
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
          placeholder="Search targets..."
          className="w-full bg-gray-800/90 backdrop-blur-sm border border-gray-700/50 rounded-lg pl-10 pr-16 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-colors"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-gray-600 bg-gray-700/50 px-1.5 py-0.5 rounded border border-gray-600/40">
          ⌘K
        </kbd>
      </div>

      {/* Dropdown */}
      {open && q && hasResults && (
        <div className="mt-1 bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded-lg overflow-hidden shadow-2xl max-h-80 overflow-y-auto">
          {results.ac.length > 0 && (
            <ResultGroup label="AIRCRAFT">
              {results.ac.map((a) => (
                <ResultRow key={a.icao} onClick={() => select("ac", a)}>
                  <span className="text-green-400">{a.callsign || "—"}</span>
                  <span className="text-gray-500 text-[10px] ml-2">
                    {a.aircraft_type || "?"}
                  </span>
                  <span className="text-gray-600 text-[10px] ml-auto">
                    {a.icao}
                  </span>
                </ResultRow>
              ))}
            </ResultGroup>
          )}
          {results.sat.length > 0 && (
            <ResultGroup label="SATELLITES">
              {results.sat.map((s) => (
                <ResultRow key={s.norad_id} onClick={() => select("sat", s)}>
                  <span className="text-green-400">{s.name}</span>
                  <span className="text-gray-500 text-[10px] ml-2">
                    {s.category}
                  </span>
                  <span className="text-gray-600 text-[10px] ml-auto">
                    #{s.norad_id}
                  </span>
                </ResultRow>
              ))}
            </ResultGroup>
          )}
          {results.cam.length > 0 && (
            <ResultGroup label="CAMERAS">
              {results.cam.map((c) => (
                <ResultRow key={c.id} onClick={() => select("cam", c)}>
                  <span className="text-green-400">{c.name}</span>
                  <span className="text-gray-600 text-[10px] ml-auto">
                    {c.city}
                  </span>
                </ResultRow>
              ))}
            </ResultGroup>
          )}
        </div>
      )}

      {open && q && !hasResults && (
        <div className="mt-1 bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4 text-center">
          <span className="font-mono text-xs text-gray-600">
            NO TARGETS FOUND
          </span>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-3 py-1.5 text-[9px] font-mono text-gray-500 tracking-widest border-b border-gray-700/30 bg-gray-900/40">
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 flex items-center text-xs font-mono hover:bg-green-500/10 transition-colors text-left"
    >
      {children}
    </button>
  );
}
