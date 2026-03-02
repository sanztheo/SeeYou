import type { Earthquake } from "../../types/seismic";

interface EarthquakePopupProps {
  earthquake: Earthquake | null;
  onClose: () => void;
}

export function EarthquakePopup({
  earthquake,
  onClose,
}: EarthquakePopupProps): React.ReactElement | null {
  if (!earthquake) return null;

  const magColor =
    earthquake.magnitude >= 6
      ? "#EF4444"
      : earthquake.magnitude >= 5
        ? "#F97316"
        : "#EAB308";

  return (
    <div className="w-full backdrop-blur-md border border-emerald-900/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/90">
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/20">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: magColor }}
          />
          <span className="text-sm font-bold text-emerald-300 truncate">
            {earthquake.title}
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
          <span className="text-emerald-800/60 shrink-0">Magnitude</span>
          <span
            className="text-emerald-300 font-mono font-bold"
            style={{ color: magColor }}
          >
            M{earthquake.magnitude.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Depth</span>
          <span className="text-emerald-300 font-mono">
            {earthquake.depth_km.toFixed(1)} km
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Date</span>
          <span className="text-emerald-300 font-mono text-right">
            {new Date(earthquake.time).toLocaleString()}
          </span>
        </div>
        {earthquake.tsunami && (
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Tsunami</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/20 text-red-400">
              WARNING
            </span>
          </div>
        )}
        {earthquake.felt != null && earthquake.felt > 0 && (
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Felt reports</span>
            <span className="text-emerald-300 font-mono">
              {earthquake.felt}
            </span>
          </div>
        )}
        <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Latitude</span>
            <span className="text-emerald-300 font-mono">
              {earthquake.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Longitude</span>
            <span className="text-emerald-300 font-mono">
              {earthquake.lon.toFixed(4)}°
            </span>
          </div>
        </div>
        {earthquake.url && (
          <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20">
            <a
              href={earthquake.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              USGS Details
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
