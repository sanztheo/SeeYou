import type { MetarStation, FlightCategory } from "../../types/metar";
import { FLIGHT_CATEGORY_COLORS } from "../../types/metar";

const BADGE_STYLES: Record<FlightCategory, { bg: string; text: string }> = {
  VFR: { bg: "bg-green-500/20", text: "text-green-400" },
  MVFR: { bg: "bg-blue-500/20", text: "text-blue-400" },
  IFR: { bg: "bg-red-500/20", text: "text-red-400" },
  LIFR: { bg: "bg-pink-500/20", text: "text-pink-400" },
};

interface MetarPopupProps {
  station: MetarStation | null;
  onClose: () => void;
}

export function MetarPopup({
  station,
  onClose,
}: MetarPopupProps): React.ReactElement | null {
  if (!station) return null;

  const cat = station.flight_category as FlightCategory;
  const badge = BADGE_STYLES[cat] ?? {
    bg: "bg-gray-500/20",
    text: "text-gray-400",
  };
  const dotColor = FLIGHT_CATEGORY_COLORS[cat] ?? "#9CA3AF";

  const windText =
    station.wind_speed_kt != null
      ? `${station.wind_dir_deg ?? "VRB"}° @ ${station.wind_speed_kt} kt${station.wind_gust_kt != null ? ` (G${station.wind_gust_kt})` : ""}`
      : "—";

  const visText =
    station.visibility_m != null
      ? station.visibility_m >= 9999
        ? ">10 km"
        : `${(station.visibility_m / 1000).toFixed(1)} km`
      : "—";

  const ceilText =
    station.ceiling_ft != null
      ? `${station.ceiling_ft.toLocaleString()} ft`
      : "CLR";

  return (
    <div className="fixed bottom-20 right-4 z-20 w-72 bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded-lg shadow-xl">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm font-bold text-gray-100 font-mono truncate">
            {station.station_id}
          </span>
          <span
            className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded ${badge.bg} ${badge.text}`}
          >
            {station.flight_category}
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
        <Row
          label="Temp / Dew"
          value={
            station.temp_c != null
              ? `${station.temp_c}°C / ${station.dewpoint_c ?? "—"}°C`
              : "—"
          }
        />
        <Row label="Wind" value={windText} />
        <Row label="Visibility" value={visText} />
        <Row label="Ceiling" value={ceilText} />

        <div className="pt-1.5 mt-1.5 border-t border-gray-700/30">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">
            Raw METAR
          </span>
          <p className="mt-1 text-[10px] font-mono text-gray-300 leading-relaxed break-all">
            {station.raw_metar}
          </p>
        </div>
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
