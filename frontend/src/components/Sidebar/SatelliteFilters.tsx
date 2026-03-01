import type { SatelliteFilter, SatelliteCategory } from "../../types/satellite";
import {
  SATELLITE_CATEGORIES,
  CATEGORY_FILTER_KEY,
} from "../../types/satellite";

const CATEGORY_COLOR: Record<SatelliteCategory, string> = {
  Station: "bg-amber-500",
  Starlink: "bg-cyan-500",
  Communication: "bg-violet-500",
  Military: "bg-rose-500",
  Weather: "bg-emerald-500",
  Navigation: "bg-blue-500",
  Science: "bg-orange-500",
  Other: "bg-zinc-500",
};

interface SatelliteFiltersProps {
  filter: SatelliteFilter;
  onFilterChange: (filter: SatelliteFilter) => void;
}

export function SatelliteFilters({
  filter,
  onFilterChange,
}: SatelliteFiltersProps): React.ReactElement {
  return (
    <div className="px-4 py-2.5 border-b border-zinc-800/60">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {SATELLITE_CATEGORIES.map((cat) => {
          const key = CATEGORY_FILTER_KEY[cat];
          return (
            <Toggle
              key={cat}
              label={cat}
              color={CATEGORY_COLOR[cat]}
              checked={filter[key]}
              onChange={(v) => onFilterChange({ ...filter, [key]: v })}
            />
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 py-0.5 text-zinc-300 hover:text-zinc-100 transition-colors"
    >
      <div
        className={`h-3 w-6 rounded-full transition-colors ${checked ? color : "bg-zinc-700"} relative`}
      >
        <div
          className={`absolute top-[2px] h-2 w-2 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[12px]" : "translate-x-[2px]"}`}
        />
      </div>
      <span className="font-mono text-[10px]">{label}</span>
    </button>
  );
}
