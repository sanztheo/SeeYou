import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { Camera, CameraFilter } from "../../types/camera";
import type { CameraProgress } from "../../services/cameraService";

const BATCH_SIZE = 40;

interface CameraFiltersProps {
  filter: CameraFilter;
  cameras: Camera[];
  progress: CameraProgress;
  onFilterChange: (filter: CameraFilter) => void;
  onSelect: (camera: Camera) => void;
}

/** Sentinel div that triggers lazy loading when scrolled into view. */
function LoadMoreSentinel({
  onVisible,
}: {
  onVisible: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return (): void => {
      observer.disconnect();
    };
  }, [onVisible]);

  return <div ref={ref} className="h-px" />;
}

function CameraRow({
  cam,
  variant,
  onSelect,
}: {
  cam: Camera;
  variant: "live" | "snapshot";
  onSelect: (camera: Camera) => void;
}): React.ReactElement {
  const isLive = variant === "live";
  return (
    <button
      onClick={() => onSelect(cam)}
      className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-zinc-700/40 transition-colors group"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isLive ? "bg-green-400 animate-pulse" : "bg-amber-400"
        }`}
      />
      <span
        className={`text-[10px] font-mono truncate transition-colors ${
          isLive
            ? "text-zinc-300 group-hover:text-zinc-100"
            : "text-zinc-400 group-hover:text-zinc-200"
        }`}
      >
        {cam.name}
      </span>
      <span
        className={`ml-auto text-[8px] font-mono flex-shrink-0 ${
          isLive ? "text-green-500/60 uppercase" : "text-amber-500/40"
        }`}
      >
        {isLive ? cam.stream_type : cam.city}
      </span>
    </button>
  );
}

export function CameraFilters({
  filter,
  cameras,
  progress,
  onFilterChange,
  onSelect,
}: CameraFiltersProps): React.ReactElement {
  const sources = Array.from(new Set(cameras.map((c) => c.source))).sort();
  const cities = Array.from(new Set(cameras.map((c) => c.city))).sort();

  const [search, setSearch] = useState("");
  const [liveOpen, setLiveOpen] = useState(true);
  const [snapOpen, setSnapOpen] = useState(true);
  const [liveLimit, setLiveLimit] = useState(BATCH_SIZE);
  const [snapLimit, setSnapLimit] = useState(BATCH_SIZE);

  const toggleSource = (source: string): void => {
    const next = new Set(filter.sources);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    onFilterChange({ ...filter, sources: next });
  };

  const toggleCity = (city: string): void => {
    const next = new Set(filter.cities);
    if (next.has(city)) next.delete(city);
    else next.add(city);
    onFilterChange({ ...filter, cities: next });
  };

  const sourceCount = (source: string): number =>
    cameras.filter((c) => c.source === source).length;

  const loading = filter.enabled && !progress.done;
  const pct =
    progress.total > 0
      ? Math.round((progress.loaded / progress.total) * 100)
      : 0;

  const { liveCams, snapshotCams } = useMemo(() => {
    const live: Camera[] = [];
    const snap: Camera[] = [];
    for (const cam of cameras) {
      if (cam.stream_type === "Hls" || cam.stream_type === "Mjpeg") {
        live.push(cam);
      } else {
        snap.push(cam);
      }
    }
    live.sort((a, b) => a.name.localeCompare(b.name));
    snap.sort((a, b) => a.name.localeCompare(b.name));
    return { liveCams: live, snapshotCams: snap };
  }, [cameras]);

  // Filter by search query (name or city)
  const filteredLive = useMemo(() => {
    if (!search) return liveCams;
    const q = search.toLowerCase();
    return liveCams.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
    );
  }, [liveCams, search]);

  const filteredSnap = useMemo(() => {
    if (!search) return snapshotCams;
    const q = search.toLowerCase();
    return snapshotCams.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
    );
  }, [snapshotCams, search]);

  // Reset lazy-load limits when filtered results change (render-time adjustment)
  const [prevCamKey, setPrevCamKey] = useState("");
  const camKey = `${filteredLive.length}-${filteredSnap.length}`;
  if (camKey !== prevCamKey) {
    setPrevCamKey(camKey);
    setLiveLimit(BATCH_SIZE);
    setSnapLimit(BATCH_SIZE);
  }

  const loadMoreLive = useCallback((): void => {
    setLiveLimit((prev) => Math.min(prev + BATCH_SIZE, filteredLive.length));
  }, [filteredLive.length]);

  const loadMoreSnap = useCallback((): void => {
    setSnapLimit((prev) => Math.min(prev + BATCH_SIZE, filteredSnap.length));
  }, [filteredSnap.length]);

  const visibleLive = filteredLive.slice(0, liveLimit);
  const visibleSnap = filteredSnap.slice(0, snapLimit);
  const noResults =
    search && filteredLive.length === 0 && filteredSnap.length === 0;

  return (
    <div className="px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Cameras
          </span>
          {filter.enabled && progress.total > 0 && (
            <span className="font-mono text-[9px] tabular-nums text-emerald-400">
              {progress.loaded.toLocaleString()}
              {!progress.done && (
                <span className="text-zinc-500">
                  /{progress.total.toLocaleString()}
                </span>
              )}
            </span>
          )}
        </div>
        <button
          onClick={() =>
            onFilterChange({ ...filter, enabled: !filter.enabled })
          }
          className="shrink-0"
        >
          <div
            className={`h-3.5 w-7 rounded-full transition-colors ${filter.enabled ? "bg-emerald-500" : "bg-zinc-700"} relative`}
          >
            <div
              className={`absolute top-[2px] h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${filter.enabled ? "translate-x-[14px]" : "translate-x-[2px]"}`}
            />
          </div>
        </button>
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="mb-2 space-y-1.5">
          <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
            {progress.total > 0 ? (
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div className="h-full w-full rounded-full bg-emerald-500/50 animate-pulse" />
            )}
          </div>
          <span className="font-mono text-[9px] text-zinc-500">
            {progress.total > 0
              ? `Loading cameras ${progress.loaded}/${progress.total}…`
              : "Connecting to camera server…"}
          </span>
        </div>
      )}

      {/* Error */}
      {filter.enabled && progress.done && cameras.length === 0 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[9px] text-zinc-600">
            Failed to load cameras
          </span>
          <button
            onClick={() => {
              onFilterChange({ ...filter, enabled: false });
              setTimeout(
                () => onFilterChange({ ...filter, enabled: true }),
                50,
              );
            }}
            className="font-mono text-[9px] text-emerald-500 hover:text-emerald-400 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search */}
      {filter.enabled && cameras.length > 0 && (
        <div className="relative mb-2">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or city…"
            className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-md pl-7 pr-7 py-1 text-[10px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      {filter.enabled && cameras.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-[9px] text-zinc-500">
            {cameras.length.toLocaleString()} cameras
          </span>
          <span className="font-mono text-[9px] text-zinc-700">|</span>
          <span className="font-mono text-[9px] text-green-400">
            {filteredLive.length} live
          </span>
          <span className="font-mono text-[9px] text-zinc-700">|</span>
          <span className="font-mono text-[9px] text-amber-400">
            {filteredSnap.length} snapshot
          </span>
        </div>
      )}

      {/* Source filters */}
      {filter.enabled && sources.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {sources.map((source) => {
            const active =
              filter.sources.size === 0 || filter.sources.has(source);
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] border transition-colors ${
                  active
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {source}
                <span className="ml-1 opacity-60">
                  {sourceCount(source).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* City filters */}
      {filter.enabled && cities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 max-h-24 overflow-y-auto scrollbar-thin">
          {cities.map((city) => {
            const active = filter.cities.size === 0 || filter.cities.has(city);
            return (
              <button
                key={city}
                onClick={() => toggleCity(city)}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] border transition-colors ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {city}
              </button>
            );
          })}
        </div>
      )}

      {/* No results */}
      {noResults && (
        <div className="text-[9px] text-zinc-600 font-mono py-2 text-center">
          No cameras matching "{search}"
        </div>
      )}

      {/* Camera list — collapsible LIVE + SNAPSHOT, no height cap */}
      {filter.enabled && cameras.length > 0 && (
        <div>
          {/* ── LIVE ── */}
          {filteredLive.length > 0 && (
            <div className="mb-1">
              <button
                onClick={() => setLiveOpen((o) => !o)}
                className="flex items-center gap-1.5 w-full text-left px-1 py-1.5"
              >
                <svg
                  className={`w-2.5 h-2.5 text-green-500 transition-transform duration-150 ${liveOpen ? "rotate-90" : ""}`}
                  viewBox="0 0 6 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 1l4 4-4 4" />
                </svg>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[9px] font-bold text-green-500 uppercase tracking-wider">
                  Live ({filteredLive.length})
                </span>
              </button>
              {liveOpen && (
                <>
                  {visibleLive.map((cam) => (
                    <CameraRow
                      key={cam.id}
                      cam={cam}
                      variant="live"
                      onSelect={onSelect}
                    />
                  ))}
                  {liveLimit < filteredLive.length && (
                    <>
                      <LoadMoreSentinel onVisible={loadMoreLive} />
                      <div className="text-[9px] text-zinc-600 font-mono px-2 py-0.5 animate-pulse">
                        Loading more…
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── SNAPSHOT ── */}
          {filteredSnap.length > 0 && (
            <div>
              <button
                onClick={() => setSnapOpen((o) => !o)}
                className="flex items-center gap-1.5 w-full text-left px-1 py-1.5"
              >
                <svg
                  className={`w-2.5 h-2.5 text-amber-500 transition-transform duration-150 ${snapOpen ? "rotate-90" : ""}`}
                  viewBox="0 0 6 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 1l4 4-4 4" />
                </svg>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                  Snapshot ({filteredSnap.length})
                </span>
              </button>
              {snapOpen && (
                <>
                  {visibleSnap.map((cam) => (
                    <CameraRow
                      key={cam.id}
                      cam={cam}
                      variant="snapshot"
                      onSelect={onSelect}
                    />
                  ))}
                  {snapLimit < filteredSnap.length && (
                    <>
                      <LoadMoreSentinel onVisible={loadMoreSnap} />
                      <div className="text-[9px] text-zinc-600 font-mono px-2 py-0.5 animate-pulse">
                        Loading more…
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
