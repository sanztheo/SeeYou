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
    <div className="w-72 backdrop-blur-sm border rounded-lg shadow-xl bg-gray-800/95 border-gray-700/50">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: branchColor }}
          />
          <span className="text-sm font-bold text-gray-100 truncate">
            {base.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
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
          <span className="text-gray-400 shrink-0">Country</span>
          <span className="text-gray-100 font-mono">{base.country}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Branch</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded"
            style={{ backgroundColor: branchColor + "33", color: branchColor }}
          >
            {base.branch.toUpperCase()}
          </span>
        </div>
        <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Latitude</span>
            <span className="text-gray-100 font-mono">
              {base.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Longitude</span>
            <span className="text-gray-100 font-mono">
              {base.lon.toFixed(4)}°
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
