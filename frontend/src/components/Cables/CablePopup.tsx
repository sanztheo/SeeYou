import type { SubmarineCable } from "../../types/cables";

interface CablePopupProps {
  cable: SubmarineCable | null;
  onClose: () => void;
}

export function CablePopup({
  cable,
  onClose,
}: CablePopupProps): React.ReactElement | null {
  if (!cable) return null;

  return (
    <div className="w-full backdrop-blur-md border border-emerald-900/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/90">
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/20">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: "#00E5FF" }}
          />
          <span className="text-sm font-bold text-emerald-300 truncate">
            {cable.name}
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
        {cable.length_km != null && (
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Length</span>
            <span className="text-emerald-300 font-mono">
              {cable.length_km.toLocaleString()} km
            </span>
          </div>
        )}
        {cable.owners && (
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Owners</span>
            <span className="text-emerald-300 font-mono text-right truncate max-w-[160px]">
              {cable.owners}
            </span>
          </div>
        )}
        {cable.year && (
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Year</span>
            <span className="text-emerald-300 font-mono">{cable.year}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Waypoints</span>
          <span className="text-emerald-300 font-mono">
            {cable.coordinates.length}
          </span>
        </div>
      </div>
    </div>
  );
}
