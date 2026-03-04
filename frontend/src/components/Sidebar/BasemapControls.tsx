import type { BasemapStyle } from "../../types/basemap";

interface BasemapControlsProps {
  currentStyle: BasemapStyle;
  onStyleChange: (style: BasemapStyle) => void;
  compact?: boolean;
}

const OPTIONS: Array<{
  id: BasemapStyle;
  label: string;
  description: string;
}> = [
  {
    id: "satellite",
    label: "Satellite realistic",
    description: "ArcGIS imagery",
  },
  {
    id: "dark",
    label: "Dark tactical",
    description: "Night operations view",
  },
  {
    id: "light",
    label: "Light streets",
    description: "Clean cartographic view",
  },
];

export function BasemapControls({
  currentStyle,
  onStyleChange,
  compact = false,
}: BasemapControlsProps): React.ReactElement {
  return (
    <div className={compact ? "px-3 py-2" : "px-4 py-3 border-b border-zinc-800/60"}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          Basemap
        </span>
      </div>

      <div className="space-y-1">
        {OPTIONS.map((option) => {
          const active = currentStyle === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onStyleChange(option.id)}
              className={`w-full border px-2 py-1 text-left transition-colors ${
                active
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800/80 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-wide">
                {option.label}
              </div>
              <div className="font-mono text-[9px] text-zinc-500">
                {option.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
