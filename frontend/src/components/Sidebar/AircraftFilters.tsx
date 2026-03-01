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
    <div className="px-4 py-2.5 border-b border-zinc-800/60 flex items-center gap-3">
      <Toggle
        label="Civilian"
        color="bg-sky-500"
        checked={filter.showCivilian}
        onChange={(v) => onFilterChange({ ...filter, showCivilian: v })}
      />
      <Toggle
        label="Military"
        color="bg-rose-500"
        checked={filter.showMilitary}
        onChange={(v) => onFilterChange({ ...filter, showMilitary: v })}
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
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
    >
      <div
        className={`h-3.5 w-7 rounded-full transition-colors ${checked ? color : "bg-zinc-700"} relative`}
      >
        <div
          className={`absolute top-[2px] h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[14px]" : "translate-x-[2px]"}`}
        />
      </div>
      <span className="font-mono text-[11px]">{label}</span>
    </button>
  );
}
