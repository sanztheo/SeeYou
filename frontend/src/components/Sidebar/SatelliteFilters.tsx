import type { SatelliteFilter, SatelliteCategory } from "../../types/satellite";
import {
  SATELLITE_CATEGORIES,
  CATEGORY_FILTER_KEY,
} from "../../types/satellite";

const CATEGORY_COLOR: Record<SatelliteCategory, string> = {
  Station: "bg-yellow-500",
  Starlink: "bg-cyan-500",
  Communication: "bg-purple-500",
  Military: "bg-red-500",
  Weather: "bg-green-500",
  Navigation: "bg-blue-500",
  Science: "bg-orange-500",
  Other: "bg-gray-500",
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
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Satellite Filters
      </h3>
      {SATELLITE_CATEGORIES.map((cat) => {
        const key = CATEGORY_FILTER_KEY[cat];
        return (
          <Toggle
            key={cat}
            label={cat}
            color={CATEGORY_COLOR[cat]}
            checked={filter[key]}
            onChange={(checked) =>
              onFilterChange({ ...filter, [key]: checked })
            }
          />
        );
      })}
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
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 w-full text-left text-sm text-gray-200 hover:text-gray-100 transition-colors"
    >
      <div
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? color : "bg-gray-600"
        } relative`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <span>{label}</span>
    </button>
  );
}
