import type { AircraftFilter } from "../../types/aircraft";

interface AircraftFiltersProps {
  filter: AircraftFilter;
  onFilterChange: (filter: AircraftFilter) => void;
}

export function AircraftFilters({
  filter,
  onFilterChange,
}: AircraftFiltersProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Filters
      </h3>
      <Toggle
        label="Civilian"
        color="bg-blue-500"
        checked={filter.showCivilian}
        onChange={(checked) =>
          onFilterChange({ ...filter, showCivilian: checked })
        }
      />
      <Toggle
        label="Military"
        color="bg-red-500"
        checked={filter.showMilitary}
        onChange={(checked) =>
          onFilterChange({ ...filter, showMilitary: checked })
        }
      />
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
