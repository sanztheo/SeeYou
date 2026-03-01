import { createPortal } from "react-dom";
import type { AircraftPosition } from "../../types/aircraft";

const METERS_TO_FEET = 3.28084;
const MS_TO_KNOTS = 1.94384;

interface AircraftTooltipProps {
  aircraft: AircraftPosition | null;
  screenX: number;
  screenY: number;
}

export function AircraftTooltip({
  aircraft,
  screenX,
  screenY,
}: AircraftTooltipProps): React.ReactPortal | null {
  if (!aircraft) return null;

  const altFt = Math.round(aircraft.altitude_m * METERS_TO_FEET);
  const speedKt = Math.round(aircraft.speed_ms * MS_TO_KNOTS);
  const heading = Math.round(aircraft.heading);

  const clampedX = Math.min(screenX + 16, window.innerWidth - 220);
  const clampedY = Math.max(screenY + 16, 8);

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: clampedX,
        top: clampedY,
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700/60 rounded-md shadow-lg px-2.5 py-1.5 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-100 font-mono tracking-wide">
            {aircraft.callsign ?? aircraft.icao}
          </span>
          {aircraft.is_military && (
            <span className="px-1 py-px text-[8px] font-bold bg-red-500/25 text-red-400 rounded leading-none">
              MIL
            </span>
          )}
          {aircraft.on_ground && (
            <span className="px-1 py-px text-[8px] font-bold bg-amber-500/25 text-amber-400 rounded leading-none">
              GND
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
          <span>
            {aircraft.on_ground ? "GND" : `${altFt.toLocaleString()} ft`}
          </span>
          <span className="text-gray-600">|</span>
          <span>{speedKt} kt</span>
          <span className="text-gray-600">|</span>
          <span>{heading}°</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
