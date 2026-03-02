import type { Vessel } from "../../types/maritime";

interface VesselPopupProps {
  vessel: Vessel | null;
  onClose: () => void;
}

export function VesselPopup({
  vessel,
  onClose,
}: VesselPopupProps): React.ReactElement | null {
  if (!vessel) return null;

  return (
    <div className="w-72 backdrop-blur-sm border rounded-lg shadow-xl bg-gray-800/95 border-gray-700/50">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{
              backgroundColor: vessel.is_sanctioned ? "#EF4444" : "#60A5FA",
            }}
          />
          <span className="text-sm font-bold text-gray-100 truncate">
            {vessel.name || vessel.mmsi}
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
          <span className="text-gray-400 shrink-0">MMSI</span>
          <span className="text-gray-100 font-mono">{vessel.mmsi}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Type</span>
          <span className="text-gray-100 font-mono">{vessel.vessel_type}</span>
        </div>
        {vessel.flag && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Flag</span>
            <span className="text-gray-100 font-mono">{vessel.flag}</span>
          </div>
        )}
        {vessel.speed_knots != null && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Speed</span>
            <span className="text-gray-100 font-mono">
              {vessel.speed_knots.toFixed(1)} kn
            </span>
          </div>
        )}
        {vessel.heading != null && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Heading</span>
            <span className="text-gray-100 font-mono">
              {vessel.heading.toFixed(0)}°
            </span>
          </div>
        )}
        {vessel.destination && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Destination</span>
            <span className="text-gray-100 font-mono text-right truncate max-w-[160px]">
              {vessel.destination}
            </span>
          </div>
        )}
        {vessel.is_sanctioned && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Status</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/20 text-red-400">
              SANCTIONED
            </span>
          </div>
        )}
        <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Latitude</span>
            <span className="text-gray-100 font-mono">
              {vessel.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Longitude</span>
            <span className="text-gray-100 font-mono">
              {vessel.lon.toFixed(4)}°
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
