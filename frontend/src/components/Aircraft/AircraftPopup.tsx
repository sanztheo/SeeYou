import { useState } from "react";
import type { AircraftPosition, FlightRoute } from "../../types/aircraft";

const METERS_TO_FEET = 3.28084;
const MS_TO_KNOTS = 1.94384;
const MS_TO_KMH = 3.6;

interface AircraftPopupProps {
  aircraft: AircraftPosition | null;
  onClose: () => void;
  flightRoute: FlightRoute | null;
  routeLoading: boolean;
}

export function AircraftPopup({
  aircraft,
  onClose,
  flightRoute,
  routeLoading,
}: AircraftPopupProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);

  if (!aircraft) return null;

  const altitudeFt = Math.round(aircraft.altitude_m * METERS_TO_FEET);
  const altitudeM = Math.round(aircraft.altitude_m);
  const speedKt = Math.round(aircraft.speed_ms * MS_TO_KNOTS);
  const speedKmh = Math.round(aircraft.speed_ms * MS_TO_KMH);
  const heading = Math.round(aircraft.heading);
  const verticalFpm = Math.round(aircraft.vertical_rate_ms / 0.00508);

  const routeSummary = flightRoute
    ? `${flightRoute.departure.iata} → ${flightRoute.arrival.iata}`
    : null;

  return (
    <div className="fixed top-4 right-4 z-20 w-72 bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded-lg shadow-xl">
      {/* Header */}
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
          {aircraft.on_ground && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 rounded">
              GND
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

      {/* Compact summary — always visible */}
      <div className="p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-100 font-mono">
            {aircraft.on_ground
              ? "Ground"
              : `${altitudeFt.toLocaleString()} ft`}
          </span>
          <span className="text-gray-100 font-mono">{speedKt} kt</span>
          <span className="text-gray-100 font-mono">{heading}°</span>
        </div>

        {aircraft.callsign && (
          <div className="text-xs">
            {routeLoading && (
              <span className="text-gray-500 italic">Loading route...</span>
            )}
            {!routeLoading && routeSummary && (
              <span className="text-blue-400 font-mono font-medium">
                {routeSummary}
              </span>
            )}
            {!routeLoading && !flightRoute && (
              <span className="text-gray-500 italic">No route</span>
            )}
          </div>
        )}
      </div>

      {/* Expand / Collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-700/30 transition-colors border-t border-gray-700/50"
      >
        <span>{expanded ? "Moins" : "Détails"}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded detail section */}
      {expanded && (
        <div className="p-3 pt-2 space-y-2 text-xs border-t border-gray-700/50">
          <Row label="ICAO" value={aircraft.icao} />
          {aircraft.callsign && (
            <Row label="Callsign" value={aircraft.callsign} />
          )}
          {aircraft.aircraft_type && (
            <Row label="Type" value={aircraft.aircraft_type} />
          )}

          <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
            <Row
              label="Altitude"
              value={
                aircraft.on_ground
                  ? "Ground"
                  : `${altitudeFt.toLocaleString()} ft (${altitudeM.toLocaleString()} m)`
              }
            />
            <Row label="Speed" value={`${speedKt} kt (${speedKmh} km/h)`} />
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

          {flightRoute && (
            <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
              <Row
                label="DEP"
                value={`${flightRoute.departure.iata} — ${flightRoute.departure.name}`}
              />
              <Row
                label=""
                value={`${flightRoute.departure.icao}  ${flightRoute.departure.lat.toFixed(2)}, ${flightRoute.departure.lon.toFixed(2)}`}
              />
              <Row
                label="ARR"
                value={`${flightRoute.arrival.iata} — ${flightRoute.arrival.name}`}
              />
              <Row
                label=""
                value={`${flightRoute.arrival.icao}  ${flightRoute.arrival.lat.toFixed(2)}, ${flightRoute.arrival.lon.toFixed(2)}`}
              />
            </div>
          )}
        </div>
      )}
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
      {label ? (
        <span className="text-gray-400 shrink-0">{label}</span>
      ) : (
        <span />
      )}
      <span className="text-gray-100 font-mono text-right">{value}</span>
    </div>
  );
}
