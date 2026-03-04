import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AircraftPosition } from "../../types/aircraft";
import type { SatellitePosition } from "../../types/satellite";
import type { Camera } from "../../types/camera";
import type { MilitaryBase } from "../../types/military";
import type { NuclearSite } from "../../types/nuclear";
import type { SubmarineCable } from "../../types/cables";
import type { Earthquake } from "../../types/seismic";
import type { Vessel } from "../../types/maritime";
import {
  geocodeSearch,
  geocodeFlyToAltitude,
  type GeocodeResult,
} from "../../services/geocodeService";

interface SearchBarProps {
  aircraft: Map<string, AircraftPosition>;
  satellites: Map<number, SatellitePosition>;
  cameras: Camera[];
  militaryBases?: MilitaryBase[];
  nuclearSites?: NuclearSite[];
  cables?: SubmarineCable[];
  earthquakes?: Earthquake[];
  vessels?: Vessel[];
  onSelectAircraft?: (ac: AircraftPosition) => void;
  onSelectSatellite?: (sat: SatellitePosition) => void;
  onSelectCamera?: (cam: Camera) => void;
  onSelectMilitary?: (base: MilitaryBase) => void;
  onSelectNuclear?: (site: NuclearSite) => void;
  onSelectCable?: (cable: SubmarineCable) => void;
  onSelectEarthquake?: (eq: Earthquake) => void;
  onSelectVessel?: (v: Vessel) => void;
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
  militaryBases,
  nuclearSites,
  cables,
  earthquakes,
  vessels,
  onSelectAircraft,
  onSelectSatellite,
  onSelectCamera,
  onSelectMilitary,
  onSelectNuclear,
  onSelectCable,
  onSelectEarthquake,
  onSelectVessel,
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
  const geoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const q = query.toLowerCase().trim();

  const localResults = useMemo(() => {
    if (!q)
      return {
        ac: [] as AircraftPosition[],
        sat: [] as SatellitePosition[],
        cam: [] as Camera[],
        mil: [] as MilitaryBase[],
        nuc: [] as NuclearSite[],
        cab: [] as SubmarineCable[],
        eq: [] as Earthquake[],
        ves: [] as Vessel[],
      };

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

    const mil: MilitaryBase[] = [];
    if (militaryBases) {
      for (const b of militaryBases) {
        if (mil.length >= MAX_PER_GROUP) break;
        if (matches(b.name, q) || matches(b.country, q) || matches(b.branch, q))
          mil.push(b);
      }
    }

    const nuc: NuclearSite[] = [];
    if (nuclearSites) {
      for (const s of nuclearSites) {
        if (nuc.length >= MAX_PER_GROUP) break;
        if (matches(s.name, q) || matches(s.country, q) || matches(s.type, q))
          nuc.push(s);
      }
    }

    const cab: SubmarineCable[] = [];
    if (cables) {
      for (const c of cables) {
        if (cab.length >= MAX_PER_GROUP) break;
        if (matches(c.name, q) || matches(c.owners, q)) cab.push(c);
      }
    }

    const eq: Earthquake[] = [];
    if (earthquakes) {
      for (const e of earthquakes) {
        if (eq.length >= MAX_PER_GROUP) break;
        if (
          matches(e.title, q) ||
          matches(String(e.magnitude), q) ||
          (q === "tsunami" && e.tsunami)
        )
          eq.push(e);
      }
    }

    const ves: Vessel[] = [];
    if (vessels) {
      for (const v of vessels) {
        if (ves.length >= MAX_PER_GROUP) break;
        if (
          matches(v.mmsi, q) ||
          matches(v.name, q) ||
          matches(v.destination, q)
        )
          ves.push(v);
      }
    }

    return { ac, sat, cam, mil, nuc, cab, eq, ves };
  }, [
    q,
    aircraft,
    satellites,
    cameras,
    militaryBases,
    nuclearSites,
    cables,
    earthquakes,
    vessels,
  ]);

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
      localResults.mil.length +
      localResults.nuc.length +
      localResults.cab.length +
      localResults.eq.length +
      localResults.ves.length +
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

  const selectIntel = useCallback(
    (
      type: "mil" | "nuc" | "cab" | "eq" | "ves",
      item: MilitaryBase | NuclearSite | SubmarineCable | Earthquake | Vessel,
    ) => {
      setOpen(false);
      setQuery("");
      if (type === "mil") onSelectMilitary?.(item as MilitaryBase);
      else if (type === "nuc") onSelectNuclear?.(item as NuclearSite);
      else if (type === "cab") onSelectCable?.(item as SubmarineCable);
      else if (type === "eq") onSelectEarthquake?.(item as Earthquake);
      else if (type === "ves") onSelectVessel?.(item as Vessel);
    },
    [
      onSelectMilitary,
      onSelectNuclear,
      onSelectCable,
      onSelectEarthquake,
      onSelectVessel,
    ],
  );

  const selectPlace = useCallback(
    (result: GeocodeResult) => {
      setOpen(false);
      setQuery("");
      onFlyToCity?.(
        result.lat,
        result.lon,
        geocodeFlyToAltitude(result.place_type),
      );
    },
    [onFlyToCity],
  );

  const leftOffset = sidebarOpen
    ? "left-[calc(50%+8px)]"
    : "left-[calc(50%-122px)]";

  return (
    <div
      ref={containerRef}
      className={`fixed top-2 ${leftOffset} z-40 w-[380px] -translate-x-1/2`}
    >
      <div className="relative hud-bracket">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-emerald-500/70 select-none">
          &gt;_
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="query // aircraft, satellites, address, place, geo..."
          className="w-full border border-emerald-900/40 bg-black/85 py-1.5 pl-8 pr-14 font-mono text-[11px] text-emerald-300 placeholder-emerald-800/50 shadow-[0_0_20px_rgba(34,197,94,0.06)] backdrop-blur-xl outline-none transition-all focus:border-emerald-500/40 focus:shadow-[0_0_24px_rgba(34,197,94,0.12)] caret-emerald-400"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 border border-emerald-900/30 bg-emerald-950/30 px-1.5 py-0.5 font-mono text-[9px] text-emerald-700/60">
          /
        </kbd>
      </div>

      {open && q && (hasResults || geoLoading) && (
        <div className="mt-0.5 max-h-72 overflow-y-auto border border-emerald-900/30 bg-black/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          {geoResults.length > 0 && (
            <Group label="PLACES & ADDRESSES" count={geoResults.length}>
              {geoResults.map((r, i) => (
                <Row
                  key={`${r.lat}-${r.lon}-${i}`}
                  onClick={() => selectPlace(r)}
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
                Searching places...
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
          {localResults.mil.length > 0 && (
            <Group label="MILITARY BASES" count={localResults.mil.length}>
              {localResults.mil.map((b) => (
                <Row
                  key={`mil-${b.name}-${b.lat}-${b.lon}`}
                  onClick={() => selectIntel("mil", b)}
                >
                  <span className="text-green-400 font-medium">{b.name}</span>
                  <span className="text-zinc-600 text-[9px] ml-1.5">
                    {b.branch}
                  </span>
                  <span className="ml-auto text-zinc-700 text-[9px]">
                    {b.country}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {localResults.nuc.length > 0 && (
            <Group label="NUCLEAR SITES" count={localResults.nuc.length}>
              {localResults.nuc.map((s) => (
                <Row
                  key={`nuc-${s.name}-${s.lat}-${s.lon}`}
                  onClick={() => selectIntel("nuc", s)}
                >
                  <span className="text-yellow-400 font-medium">{s.name}</span>
                  <span className="text-zinc-600 text-[9px] ml-1.5">
                    {s.type}
                  </span>
                  <span className="ml-auto text-zinc-700 text-[9px]">
                    {s.country}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {localResults.cab.length > 0 && (
            <Group label="SUBMARINE CABLES" count={localResults.cab.length}>
              {localResults.cab.map((c) => (
                <Row key={c.id} onClick={() => selectIntel("cab", c)}>
                  <span className="text-sky-400 font-medium">{c.name}</span>
                  {c.length_km != null && (
                    <span className="ml-auto text-zinc-700 text-[9px]">
                      {c.length_km.toLocaleString()} km
                    </span>
                  )}
                </Row>
              ))}
            </Group>
          )}
          {localResults.eq.length > 0 && (
            <Group label="EARTHQUAKES" count={localResults.eq.length}>
              {localResults.eq.map((e) => (
                <Row key={e.id} onClick={() => selectIntel("eq", e)}>
                  <span className="text-yellow-300 font-medium">
                    M{e.magnitude.toFixed(1)}
                  </span>
                  <span className="text-zinc-400 text-[9px] ml-1.5 truncate max-w-[180px]">
                    {e.title}
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {localResults.ves.length > 0 && (
            <Group label="VESSELS" count={localResults.ves.length}>
              {localResults.ves.map((v) => (
                <Row key={v.mmsi} onClick={() => selectIntel("ves", v)}>
                  <span className="text-indigo-400 font-medium">
                    {v.name || v.mmsi}
                  </span>
                  <span className="text-zinc-600 text-[9px] ml-1.5">
                    {v.vessel_type}
                  </span>
                  {v.flag && (
                    <span className="ml-auto text-zinc-700 text-[9px]">
                      {v.flag}
                    </span>
                  )}
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}

      {open && q && !hasResults && !geoLoading && (
        <div className="mt-0.5 border border-emerald-900/30 bg-black/95 p-3 text-center shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <span className="font-mono text-[10px] text-emerald-800/60">
            0 MATCHES // &quot;{query}&quot;
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
      <div className="flex items-center justify-between border-b border-emerald-900/20 bg-emerald-950/15 px-3 py-1">
        <span className="font-mono text-[8px] tracking-[0.25em] text-emerald-600/60 uppercase">
          {label}
        </span>
        <span className="font-mono text-[8px] text-emerald-800/40">
          [{count}]
        </span>
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
      className="flex w-full items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-left transition-all hover:bg-emerald-500/8 hover:pl-4 border-l-2 border-transparent hover:border-emerald-500/40"
    >
      {children}
    </button>
  );
}
