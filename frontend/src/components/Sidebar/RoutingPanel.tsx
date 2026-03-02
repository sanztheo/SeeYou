import { useState, useRef, useEffect, useCallback } from "react";
import type { RouteResult } from "../../types/traffic";
import { fetchRoute } from "../../services/trafficService";

interface RoutingPanelProps {
  onRouteResult?: (routes: RouteResult[]) => void;
  onClearRoute?: () => void;
  pickingOrigin?: boolean;
  pickingDestination?: boolean;
  onPickOrigin?: () => void;
  onPickDestination?: () => void;
  originCoord?: [number, number] | null;
  destinationCoord?: [number, number] | null;
}

export function RoutingPanel({
  onRouteResult,
  onClearRoute,
  pickingOrigin,
  pickingDestination,
  onPickOrigin,
  onPickDestination,
  originCoord,
  destinationCoord,
}: RoutingPanelProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const calculate = useCallback(async () => {
    if (!originCoord || !destinationCoord) return;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    setRoutes([]);
    setSelectedIdx(0);

    try {
      const result = await fetchRoute(
        originCoord,
        destinationCoord,
        true,
        ac.signal,
      );
      if (ac.signal.aborted) return;
      setRoutes(result);
      onRouteResult?.(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Route calculation failed");
      console.error("[Routing]", err);
    } finally {
      setLoading(false);
    }
  }, [originCoord, destinationCoord, onRouteResult]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleClear = (): void => {
    setRoutes([]);
    setError(null);
    setSelectedIdx(0);
    onClearRoute?.();
  };

  const selected = routes[selectedIdx];

  return (
    <div className="px-4 py-3 border-b border-zinc-800/60 space-y-3">
      <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        Routing
      </span>

      {/* Origin */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          {originCoord ? (
            <span className="font-mono text-[10px] text-zinc-300 truncate block">
              {originCoord[0].toFixed(4)}, {originCoord[1].toFixed(4)}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-zinc-600 italic">
              No origin
            </span>
          )}
        </div>
        <button
          onClick={onPickOrigin}
          className={`font-mono text-[9px] px-2 py-0.5 rounded border transition-colors ${
            pickingOrigin
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
          }`}
        >
          {pickingOrigin ? "Click map…" : "Pick"}
        </button>
      </div>

      {/* Destination */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
        <div className="flex-1 min-w-0">
          {destinationCoord ? (
            <span className="font-mono text-[10px] text-zinc-300 truncate block">
              {destinationCoord[0].toFixed(4)}, {destinationCoord[1].toFixed(4)}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-zinc-600 italic">
              No destination
            </span>
          )}
        </div>
        <button
          onClick={onPickDestination}
          className={`font-mono text-[9px] px-2 py-0.5 rounded border transition-colors ${
            pickingDestination
              ? "border-rose-500 text-rose-400 bg-rose-500/10"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
          }`}
        >
          {pickingDestination ? "Click map…" : "Pick"}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={calculate}
          disabled={!originCoord || !destinationCoord || loading}
          className="flex-1 font-mono text-[10px] py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
        >
          {loading ? "Calculating…" : "Calculate Route"}
        </button>
        {routes.length > 0 && (
          <button
            onClick={handleClear}
            className="font-mono text-[10px] px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="font-mono text-[10px] text-red-400">{error}</div>
      )}

      {/* Route alternatives */}
      {routes.length > 1 && (
        <div className="flex gap-1">
          {routes.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                setSelectedIdx(i);
                onRouteResult?.([routes[i]]);
              }}
              className={`flex-1 font-mono text-[9px] py-1 rounded transition-colors ${
                i === selectedIdx
                  ? "bg-emerald-600/30 text-emerald-300 border border-emerald-600"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200"
              }`}
            >
              {formatDuration(r.travel_time_seconds)}
            </button>
          ))}
        </div>
      )}

      {/* Selected route details */}
      {selected && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Distance"
              value={`${(selected.distance_meters / 1000).toFixed(1)} km`}
            />
            <Stat
              label="ETA"
              value={formatDuration(selected.travel_time_seconds)}
            />
            <Stat
              label="Delay"
              value={
                selected.traffic_delay_seconds > 0
                  ? `+${formatDuration(selected.traffic_delay_seconds)}`
                  : "None"
              }
              accent={selected.traffic_delay_seconds > 60}
            />
          </div>

          {selected.instructions.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
              {selected.instructions
                .filter((instr) => instr.street)
                .slice(0, 20)
                .map((instr, i) => (
                  <div
                    key={i}
                    className="font-mono text-[9px] text-zinc-400 flex gap-2"
                  >
                    <span className="text-zinc-600 w-4 shrink-0 text-right">
                      {i + 1}
                    </span>
                    <span className="text-zinc-300 truncate">
                      {instr.street || instr.maneuver}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">
        {label}
      </div>
      <div
        className={`font-mono text-[11px] tabular-nums ${accent ? "text-amber-400" : "text-zinc-200"}`}
      >
        {value}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m} min`;
}
