import type { FireHotspot } from "../../types/fires";

interface FirePopupProps {
  fire: FireHotspot | null;
  onClose: () => void;
}

export function FirePopup({
  fire,
  onClose,
}: FirePopupProps): React.ReactElement | null {
  if (!fire) return null;

  const confColor =
    fire.confidence === "high"
      ? "#EF4444"
      : fire.confidence === "nominal"
        ? "#F97316"
        : "#EAB308";

  return (
    <div className="w-full backdrop-blur-md border border-emerald-900/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/90">
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm font-bold text-emerald-300 truncate">
            Fire Hotspot
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-emerald-900/20 text-emerald-800/60 hover:text-emerald-400 transition-colors"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">FRP</span>
          <span className="text-emerald-300 font-mono font-bold">
            {fire.frp.toFixed(1)} MW
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Brightness</span>
          <span className="text-emerald-300 font-mono">
            {fire.brightness.toFixed(1)} K
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Confidence</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded"
            style={{ backgroundColor: confColor + "33", color: confColor }}
          >
            {fire.confidence.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Satellite</span>
          <span className="text-emerald-300 font-mono">{fire.satellite}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Date</span>
          <span className="text-emerald-300 font-mono">
            {fire.acq_date} {fire.acq_time}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Day/Night</span>
          <span className="text-emerald-300 font-mono">
            {fire.daynight === "D" ? "Day" : "Night"}
          </span>
        </div>
        <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Latitude</span>
            <span className="text-emerald-300 font-mono">
              {fire.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Longitude</span>
            <span className="text-emerald-300 font-mono">
              {fire.lon.toFixed(4)}°
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
