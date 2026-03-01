import type {
  MetarStation,
  MetarFilter,
  FlightCategory,
} from "../../types/metar";
import {
  ALL_FLIGHT_CATEGORIES,
  FLIGHT_CATEGORY_COLORS,
} from "../../types/metar";

const CATEGORY_TW: Record<FlightCategory, { active: string; ring: string }> = {
  VFR: {
    active: "border-green-500/40 bg-green-500/10 text-green-400",
    ring: "border-green-500/20",
  },
  MVFR: {
    active: "border-blue-500/40 bg-blue-500/10 text-blue-400",
    ring: "border-blue-500/20",
  },
  IFR: {
    active: "border-red-500/40 bg-red-500/10 text-red-400",
    ring: "border-red-500/20",
  },
  LIFR: {
    active: "border-pink-500/40 bg-pink-500/10 text-pink-400",
    ring: "border-pink-500/20",
  },
};

interface MetarFiltersProps {
  filter: MetarFilter;
  stations: MetarStation[];
  onFilterChange: (f: MetarFilter) => void;
}

export function MetarFilters({
  filter,
  stations,
  onFilterChange,
}: MetarFiltersProps): React.ReactElement {
  const counts: Record<string, number> = {};
  for (const s of stations) {
    counts[s.flight_category] = (counts[s.flight_category] ?? 0) + 1;
  }

  const toggleCategory = (cat: FlightCategory): void => {
    const next = new Set(filter.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onFilterChange({ ...filter, categories: next });
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            METAR
          </span>
          {filter.enabled && stations.length > 0 && (
            <span className="font-mono text-[9px] tabular-nums text-emerald-400">
              {stations.length.toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={() =>
            onFilterChange({ ...filter, enabled: !filter.enabled })
          }
          className="shrink-0"
          role="switch"
          aria-checked={filter.enabled}
          aria-label="Toggle METAR layer"
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

      {filter.enabled && (
        <div className="flex flex-wrap gap-1">
          {ALL_FLIGHT_CATEGORIES.map((cat) => {
            const active =
              filter.categories.size === 0 || filter.categories.has(cat);
            const tw = CATEGORY_TW[cat];
            const count = counts[cat] ?? 0;

            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] border transition-colors ${
                  active
                    ? tw.active
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: FLIGHT_CATEGORY_COLORS[cat] }}
                />
                {cat}
                {count > 0 && (
                  <span className="tabular-nums opacity-70">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
