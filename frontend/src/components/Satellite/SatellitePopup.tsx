import type {
  SatellitePosition,
  SatelliteCategory,
} from "../../types/satellite";

const CATEGORY_BADGE: Record<SatelliteCategory, { bg: string; text: string }> =
  {
    Station: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
    Starlink: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
    Military: { bg: "bg-red-500/20", text: "text-red-400" },
    Weather: { bg: "bg-green-500/20", text: "text-green-400" },
    Navigation: { bg: "bg-blue-500/20", text: "text-blue-400" },
    Communication: { bg: "bg-purple-500/20", text: "text-purple-400" },
    Science: { bg: "bg-orange-500/20", text: "text-orange-400" },
    Other: { bg: "bg-gray-500/20", text: "text-gray-400" },
  };

interface SatellitePopupProps {
  satellite: SatellitePosition | null;
  onClose: () => void;
}

export function SatellitePopup({
  satellite,
  onClose,
}: SatellitePopupProps): React.ReactElement | null {
  if (!satellite) return null;

  const isISS =
    satellite.category === "Station" && satellite.name.includes("ISS");
  const badge = CATEGORY_BADGE[satellite.category] ?? CATEGORY_BADGE.Other;

  return (
    <div
      className={`fixed top-4 right-4 z-20 w-72 backdrop-blur-sm border rounded-lg shadow-xl ${
        isISS
          ? "bg-gray-800/95 border-yellow-500/40 shadow-yellow-500/10"
          : "bg-gray-800/95 border-gray-700/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          {isISS && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
          <span className="text-sm font-bold text-gray-100 truncate">
            {satellite.name}
          </span>
          <span
            className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded ${badge.bg} ${badge.text}`}
          >
            {satellite.category.toUpperCase()}
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

      {/* Data grid */}
      <div className="p-3 space-y-2 text-xs">
        <Row label="NORAD ID" value={String(satellite.norad_id)} />
        <Row
          label="Altitude"
          value={`${satellite.altitude_km.toFixed(1)} km`}
        />
        <Row
          label="Velocity"
          value={`${satellite.velocity_km_s.toFixed(2)} km/s`}
        />

        <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
          <Row label="Latitude" value={`${satellite.lat.toFixed(4)}°`} />
          <Row label="Longitude" value={`${satellite.lon.toFixed(4)}°`} />
        </div>

        {isISS && (
          <div className="pt-1.5 mt-1.5 border-t border-yellow-500/20">
            <div className="flex items-center gap-1.5 text-[10px] text-yellow-400/80">
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
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              <span className="font-mono">International Space Station</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-100 font-mono text-right">{value}</span>
    </div>
  );
}
