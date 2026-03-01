import type { TrafficFilter } from "../../types/traffic";

interface TrafficControlsProps {
  filter: TrafficFilter;
  onFilterChange: (filter: TrafficFilter) => void;
}

export function TrafficControls({
  filter,
  onFilterChange,
}: TrafficControlsProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Traffic
      </h3>
      <Toggle
        label="Show Traffic"
        color="bg-green-500"
        checked={filter.enabled}
        onChange={(v) => onFilterChange({ ...filter, enabled: v })}
      />
      {filter.enabled && (
        <div className="ml-2 space-y-1">
          <Toggle
            label="Motorway"
            color="bg-yellow-400"
            checked={filter.showMotorway}
            onChange={(v) => onFilterChange({ ...filter, showMotorway: v })}
          />
          <Toggle
            label="Trunk"
            color="bg-orange-500"
            checked={filter.showTrunk}
            onChange={(v) => onFilterChange({ ...filter, showTrunk: v })}
          />
          <Toggle
            label="Primary"
            color="bg-white"
            checked={filter.showPrimary}
            onChange={(v) => onFilterChange({ ...filter, showPrimary: v })}
          />
          <Toggle
            label="Secondary"
            color="bg-gray-400"
            checked={filter.showSecondary}
            onChange={(v) => onFilterChange({ ...filter, showSecondary: v })}
          />
        </div>
      )}
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
