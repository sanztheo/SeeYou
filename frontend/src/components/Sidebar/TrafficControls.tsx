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
    <div className="px-4 py-3 border-b border-zinc-800/60">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          Traffic
        </span>
        <Toggle
          checked={filter.enabled}
          color="bg-emerald-500"
          onChange={(v) => onFilterChange({ ...filter, enabled: v })}
        />
      </div>

      {filter.enabled && (
        <div className="space-y-3">
          {/* TomTom layers */}
          <div>
            <SectionLabel text="Live layers" />
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
              <LayerToggle
                label="Congestion"
                color="bg-emerald-500"
                checked={filter.showTilesOverlay}
                onChange={(v) =>
                  onFilterChange({ ...filter, showTilesOverlay: v })
                }
              />
              <LayerToggle
                label="Flow detail"
                color="bg-sky-500"
                checked={filter.showFlowSegments}
                onChange={(v) =>
                  onFilterChange({ ...filter, showFlowSegments: v })
                }
              />
            </div>
          </div>

          {/* Incidents */}
          <div>
            <div className="flex items-center justify-between">
              <SectionLabel text="Incidents" />
              <Toggle
                checked={filter.showIncidents}
                color="bg-rose-500"
                onChange={(v) =>
                  onFilterChange({ ...filter, showIncidents: v })
                }
              />
            </div>
            {filter.showIncidents && (
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 mt-1">
                <LayerToggle
                  label="Accidents"
                  color="bg-red-500"
                  checked={filter.showAccidents}
                  onChange={(v) =>
                    onFilterChange({ ...filter, showAccidents: v })
                  }
                />
                <LayerToggle
                  label="Works"
                  color="bg-orange-500"
                  checked={filter.showRoadWorks}
                  onChange={(v) =>
                    onFilterChange({ ...filter, showRoadWorks: v })
                  }
                />
                <LayerToggle
                  label="Closures"
                  color="bg-rose-700"
                  checked={filter.showClosures}
                  onChange={(v) =>
                    onFilterChange({ ...filter, showClosures: v })
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
      {text}
    </span>
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

function LayerToggle({
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
