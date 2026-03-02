import type { MilitaryBase } from "../../types/military";

const BRANCH_COLORS: Record<string, string> = {
  air: "#60A5FA",
  army: "#34D399",
  naval: "#818CF8",
  intelligence: "#F472B6",
};

interface MilitaryBasePopupProps {
  base: MilitaryBase | null;
  onClose: () => void;
}

export function MilitaryBasePopup({
  base,
  onClose,
}: MilitaryBasePopupProps): React.ReactElement | null {
  if (!base) return null;

  const branchColor = BRANCH_COLORS[base.branch] ?? "#34D399";

  return (
    <div className="w-full backdrop-blur-md border border-emerald-900/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/90">
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/20">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: branchColor }}
          />
          <span className="text-sm font-bold text-emerald-300 truncate">
            {base.name}
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
          <span className="text-emerald-800/60 shrink-0">Country</span>
          <span className="text-emerald-300 font-mono">{base.country}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Branch</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded"
            style={{ backgroundColor: branchColor + "33", color: branchColor }}
          >
            {base.branch.toUpperCase()}
          </span>
        </div>
        <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Latitude</span>
            <span className="text-emerald-300 font-mono">
              {base.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Longitude</span>
            <span className="text-emerald-300 font-mono">
              {base.lon.toFixed(4)}°
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
