import type { NuclearSite } from "../../types/nuclear";

const TYPE_COLORS: Record<string, string> = {
  power: "#FBBF24",
  weapons: "#EF4444",
  enrichment: "#F97316",
  reprocessing: "#A855F7",
};

interface NuclearSitePopupProps {
  site: NuclearSite | null;
  onClose: () => void;
}

export function NuclearSitePopup({
  site,
  onClose,
}: NuclearSitePopupProps): React.ReactElement | null {
  if (!site) return null;

  const typeColor = TYPE_COLORS[site.type] ?? "#FBBF24";

  return (
    <div className="w-72 backdrop-blur-sm border rounded-lg shadow-xl bg-gray-800/95 border-gray-700/50">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: typeColor }}
          />
          <span className="text-sm font-bold text-gray-100 truncate">
            {site.name}
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
          <span className="text-gray-100 font-mono">{site.country}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Type</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded"
            style={{ backgroundColor: typeColor + "33", color: typeColor }}
          >
            {site.type.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Status</span>
          <span className="text-gray-100 font-mono">{site.status}</span>
        </div>
        {site.capacity_mw > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Capacity</span>
            <span className="text-gray-100 font-mono">
              {site.capacity_mw.toLocaleString()} MW
            </span>
          </div>
        )}
        <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Latitude</span>
            <span className="text-gray-100 font-mono">
              {site.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Longitude</span>
            <span className="text-gray-100 font-mono">
              {site.lon.toFixed(4)}°
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
