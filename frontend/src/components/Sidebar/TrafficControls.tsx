import type { TrafficFilter } from "../../types/traffic";

interface TrafficControlsProps {
  filter: TrafficFilter;
  onFilterChange: (filter: TrafficFilter) => void;
  loading?: boolean;
  roadCount?: number;
}

export function TrafficControls({
  filter,
  onFilterChange,
  loading = false,
  roadCount = 0,
}: TrafficControlsProps): React.ReactElement {
  return (
    <div className="px-4 py-3 border-b border-zinc-800/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Traffic
          </span>
          {filter.enabled && roadCount > 0 && (
            <span className="font-mono text-[9px] tabular-nums text-emerald-400">
              {roadCount.toLocaleString()} roads
            </span>
          )}
          {filter.enabled && loading && (
            <span className="font-mono text-[9px] text-amber-400 animate-pulse">
              loading…
            </span>
          )}
        </div>
        <Toggle
          checked={filter.enabled}
          color="bg-emerald-500"
          onChange={(v) => onFilterChange({ ...filter, enabled: v })}
        />
      </div>

      {filter.enabled && loading && (
        <div className="mb-2">
          <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-amber-500/70 animate-[pulse_1s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {filter.enabled && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <RoadToggle
            label="Motorway"
            color="bg-amber-400"
            checked={filter.showMotorway}
            onChange={(v) => onFilterChange({ ...filter, showMotorway: v })}
          />
          <RoadToggle
            label="Trunk"
            color="bg-orange-500"
            checked={filter.showTrunk}
            onChange={(v) => onFilterChange({ ...filter, showTrunk: v })}
          />
          <RoadToggle
            label="Primary"
            color="bg-zinc-300"
            checked={filter.showPrimary}
            onChange={(v) => onFilterChange({ ...filter, showPrimary: v })}
          />
          <RoadToggle
            label="Secondary"
            color="bg-zinc-500"
            checked={filter.showSecondary}
            onChange={(v) => onFilterChange({ ...filter, showSecondary: v })}
          />
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  color,
  onChange,
}: {
  checked: boolean;
  color: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="shrink-0">
      <div
        className={`h-3.5 w-7 rounded-full transition-colors ${checked ? color : "bg-zinc-700"} relative`}
      >
        <div
          className={`absolute top-[2px] h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[14px]" : "translate-x-[2px]"}`}
        />
      </div>
    </button>
  );
}

function RoadToggle({
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
