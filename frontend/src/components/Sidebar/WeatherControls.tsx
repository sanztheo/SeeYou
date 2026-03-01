import type { WeatherFilter } from "../../types/weather";

interface WeatherControlsProps {
  filter: WeatherFilter;
  onFilterChange: (f: WeatherFilter) => void;
  pointCount: number;
  loading: boolean;
}

export function WeatherControls({
  filter,
  onFilterChange,
  pointCount,
  loading,
}: WeatherControlsProps): React.ReactElement {
  return (
    <div className="px-4 py-3 border-b border-zinc-800/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Weather
          </span>
          {filter.enabled && pointCount > 0 && (
            <span className="font-mono text-[9px] tabular-nums text-emerald-400">
              {pointCount.toLocaleString()} pts
            </span>
          )}
          {filter.enabled && loading && (
            <span className="font-mono text-[9px] text-amber-400 animate-pulse">
              loading…
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
          aria-label="Toggle weather layer"
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
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <SubToggle
            label="Wind"
            checked={filter.showWind}
            onChange={(v) => onFilterChange({ ...filter, showWind: v })}
          />
          <SubToggle
            label="Temperature"
            checked={filter.showTemperature}
            onChange={(v) => onFilterChange({ ...filter, showTemperature: v })}
          />
          <SubToggle
            label="Clouds"
            checked={filter.showClouds}
            onChange={(v) => onFilterChange({ ...filter, showClouds: v })}
          />
        </div>
      )}
    </div>
  );
}

function SubToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 py-0.5 text-zinc-300 hover:text-zinc-100 transition-colors"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
    >
      <div
        className={`h-3 w-6 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-zinc-700"} relative`}
      >
        <div
          className={`absolute top-[2px] h-2 w-2 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[12px]" : "translate-x-[2px]"}`}
        />
      </div>
      <span className="font-mono text-[10px]">{label}</span>
    </button>
  );
}
