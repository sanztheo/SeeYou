import type { AircraftPosition } from "../../types/aircraft";

const METERS_TO_FEET = 3.28084;
const MS_TO_KNOTS = 1.94384;

interface AircraftPopupProps {
  aircraft: AircraftPosition | null;
  onClose: () => void;
}

export function AircraftPopup({
  aircraft,
  onClose,
}: AircraftPopupProps): React.ReactElement | null {
  if (!aircraft) return null;

  const altitudeFt = Math.round(aircraft.altitude_m * METERS_TO_FEET);
  const speedKt = Math.round(aircraft.speed_ms * MS_TO_KNOTS);
  const heading = Math.round(aircraft.heading);
  const verticalFpm = Math.round(aircraft.vertical_rate_ms / 0.00508);

  return (
    <div className="fixed top-4 right-4 z-20 w-72 bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded-lg shadow-xl">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-100">
            {aircraft.callsign ?? aircraft.icao}
          </span>
          {aircraft.is_military && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 rounded">
              MIL
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
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
        <Row label="ICAO" value={aircraft.icao} />
        {aircraft.aircraft_type && (
          <Row label="Type" value={aircraft.aircraft_type} />
        )}
        <Row
          label="Altitude"
          value={
            aircraft.on_ground ? "Ground" : `${altitudeFt.toLocaleString()} ft`
          }
        />
        <Row label="Speed" value={`${speedKt} kt`} />
        <Row label="Heading" value={`${heading}°`} />
        <Row
          label="V/S"
          value={`${verticalFpm > 0 ? "+" : ""}${verticalFpm} fpm`}
        />
        <Row
          label="Position"
          value={`${aircraft.lat.toFixed(4)}, ${aircraft.lon.toFixed(4)}`}
        />
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
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100 font-mono">{value}</span>
    </div>
  );
}
