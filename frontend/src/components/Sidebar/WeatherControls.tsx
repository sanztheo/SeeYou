import type { WeatherFilter } from "../../types/weather";

interface WeatherControlsProps {
  filter: WeatherFilter;
  onFilterChange: (f: WeatherFilter) => void;
  loading: boolean;
}

export function WeatherControls({
  filter,
  onFilterChange,
  loading,
}: WeatherControlsProps): React.ReactElement {
  return (
    <div className="px-4 py-3 border-b border-zinc-800/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Weather
          </span>
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
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <SubToggle
              label="Radar"
              checked={filter.showRadar}
              onChange={(v) => onFilterChange({ ...filter, showRadar: v })}
            />
            <SubToggle
              label="Wind"
              checked={filter.showWind}
              onChange={(v) => onFilterChange({ ...filter, showWind: v })}
            />
            <SubToggle
              label="Temperature"
              checked={filter.showTemperature}
              onChange={(v) =>
                onFilterChange({ ...filter, showTemperature: v })
              }
            />
            <SubToggle
              label="Air Quality"
              checked={filter.showAirQuality}
              onChange={(v) => onFilterChange({ ...filter, showAirQuality: v })}
            />
          </div>

          {filter.showRadar && (
            <SliderControl
              label="Radar"
              value={filter.radarOpacity}
              onChange={(v) => onFilterChange({ ...filter, radarOpacity: v })}
            />
          )}

          {filter.showWind && (
            <SliderControl
              label="Wind"
              value={filter.windOpacity}
              onChange={(v) => onFilterChange({ ...filter, windOpacity: v })}
            />
          )}

          {filter.showTemperature && (
            <>
              <SliderControl
                label="Temp"
                value={filter.temperatureOpacity}
                onChange={(v) =>
                  onFilterChange({ ...filter, temperatureOpacity: v })
                }
              />
              <TemperatureLegend />
            </>
          )}

          {filter.showAirQuality && (
            <SliderControl
              label="AQI"
              value={filter.airQualityOpacity}
              onChange={(v) =>
                onFilterChange({ ...filter, airQualityOpacity: v })
              }
            />
          )}

          {filter.showRadar && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-zinc-500 w-10">
                Speed
              </span>
              <input
                type="range"
                min={200}
                max={1500}
                step={100}
                value={1700 - filter.animationSpeed}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    animationSpeed: 1700 - Number(e.target.value),
                  })
                }
                className="flex-1 h-1 accent-emerald-500 bg-zinc-700 rounded-full appearance-none cursor-pointer"
              />
            </div>
          )}
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

function TemperatureLegend() {
  const stops = [
    { t: -40, r: 130, g: 22, b: 146 },
    { t: -30, r: 30, g: 60, b: 180 },
    { t: -20, r: 0, g: 120, b: 240 },
    { t: -10, r: 0, g: 185, b: 255 },
    { t: 0, r: 0, g: 220, b: 220 },
    { t: 10, r: 80, g: 220, b: 80 },
    { t: 20, r: 210, g: 230, b: 50 },
    { t: 30, r: 255, g: 160, b: 0 },
    { t: 40, r: 255, g: 50, b: 0 },
    { t: 50, r: 180, g: 0, b: 40 },
  ];
  const gradient = stops
    .map((s, i) => {
      const pct = (i / (stops.length - 1)) * 100;
      return `rgb(${s.r},${s.g},${s.b}) ${pct}%`;
    })
    .join(", ");

  const labels = [-40, -20, 0, 20, 40];

  return (
    <div className="mt-1 mb-0.5">
      <div
        className="h-2 rounded-sm w-full"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="flex justify-between mt-0.5">
        {labels.map((t) => (
          <span key={t} className="font-mono text-[8px] text-zinc-500">
            {t}°
          </span>
        ))}
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] text-zinc-500 w-10">{label}</span>
      <input
        type="range"
        min={0.1}
        max={1}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-emerald-500 bg-zinc-700 rounded-full appearance-none cursor-pointer"
      />
      <span className="font-mono text-[9px] text-zinc-500 w-6 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
