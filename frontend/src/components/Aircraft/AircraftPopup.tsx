import { useState } from "react";
import type {
  AircraftPosition,
  FlightRoute,
  PredictedTrajectory,
} from "../../types/aircraft";

const METERS_TO_FEET = 3.28084;
const MS_TO_KNOTS = 1.94384;
const MS_TO_KMH = 3.6;

const MODEL_NAMES = ["CV", "CA", "CT", "CD"] as const;

function getPatternName(pat: PredictedTrajectory["pattern"]): string | null {
  if (!pat) return null;
  if ("Orbit" in pat)
    return `Orbit (r=${Math.round(pat.Orbit.radius_m / 1000)} km)`;
  if ("Cap" in pat) return "Combat Air Patrol";
  if ("Transit" in pat)
    return `Transit ${Math.round(pat.Transit.heading_deg)}°`;
  if ("Holding" in pat) return "Holding";
  return null;
}

interface AircraftPopupProps {
  aircraft: AircraftPosition | null;
  onClose: () => void;
  flightRoute: FlightRoute | null;
  routeLoading: boolean;
  prediction: PredictedTrajectory | null;
}

export function AircraftPopup({
  aircraft,
  onClose,
  flightRoute,
  routeLoading,
  prediction,
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
    <div className="w-full backdrop-blur-md border border-emerald-900/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/90">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-emerald-300">
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
          className="p-1 rounded hover:bg-emerald-900/20 text-emerald-800/60 hover:text-emerald-400 transition-colors"
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
          <span className="text-emerald-300 font-mono">
            {aircraft.on_ground
              ? "Ground"
              : `${altitudeFt.toLocaleString()} ft`}
          </span>
          <span className="text-emerald-300 font-mono">{speedKt} kt</span>
          <span className="text-emerald-300 font-mono">{heading}°</span>
        </div>

        {aircraft.callsign && (
          <div className="text-xs">
            {routeLoading && (
              <span className="text-emerald-800/50 italic">
                Loading route...
              </span>
            )}
            {!routeLoading && routeSummary && (
              <span className="text-blue-400 font-mono font-medium">
                {routeSummary}
              </span>
            )}
            {!routeLoading && !flightRoute && (
              <span className="text-emerald-800/50 italic">No route</span>
            )}
          </div>
        )}
      </div>

      {/* Expand / Collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-emerald-800/50 hover:text-emerald-400 hover:bg-emerald-900/20 transition-colors border-t border-emerald-900/20"
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
        <div className="p-3 pt-2 space-y-2 text-xs border-t border-emerald-900/20">
          <Row label="ICAO" value={aircraft.icao} />
          {aircraft.callsign && (
            <Row label="Callsign" value={aircraft.callsign} />
          )}
          {aircraft.aircraft_type && (
            <Row label="Type" value={aircraft.aircraft_type} />
          )}

          <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20 space-y-2">
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
            <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20 space-y-2">
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

          {prediction && (
            <div className="pt-1.5 mt-1.5 border-t border-orange-500/30 space-y-2">
              <span className="text-orange-400 text-[10px] font-semibold uppercase tracking-wider">
                IMM-EKF Prediction
              </span>
              {getPatternName(prediction.pattern) && (
                <Row
                  label="Pattern"
                  value={getPatternName(prediction.pattern)!}
                />
              )}
              <Row
                label="Horizon"
                value={`${prediction.points.length > 0 ? Math.round(prediction.points[prediction.points.length - 1].dt_secs / 60) : 0} min`}
              />
              <div className="space-y-1">
                <span className="text-emerald-800/60 text-[10px]">
                  Model weights
                </span>
                <div className="flex gap-0.5 h-3 rounded overflow-hidden">
                  {prediction.model_probabilities.map((p, i) => (
                    <div
                      key={MODEL_NAMES[i]}
                      className="relative h-full transition-all duration-300"
                      style={{
                        width: `${p * 100}%`,
                        backgroundColor:
                          i === 0
                            ? "#3B82F6"
                            : i === 1
                              ? "#F59E0B"
                              : i === 2
                                ? "#EF4444"
                                : "#8B5CF6",
                      }}
                      title={`${MODEL_NAMES[i]}: ${(p * 100).toFixed(1)}%`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-emerald-800/50 font-mono">
                  {prediction.model_probabilities.map((p, i) => (
                    <span key={MODEL_NAMES[i]}>
                      {MODEL_NAMES[i]} {(p * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
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
        <span className="text-emerald-800/60 shrink-0">{label}</span>
      ) : (
        <span />
      )}
      <span className="text-emerald-300 font-mono text-right">{value}</span>
    </div>
  );
}
