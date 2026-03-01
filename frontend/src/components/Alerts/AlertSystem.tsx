import { useState, useEffect, useRef, useCallback } from "react";
import type { AircraftPosition } from "../../types/aircraft";
import type { SatellitePosition } from "../../types/satellite";

type AlertType =
  | "military_entry"
  | "satellite_pass"
  | "camera_offline"
  | "info";

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  fading: boolean;
}

interface AlertSystemProps {
  aircraft: Map<string, AircraftPosition>;
  satellites: Map<number, SatellitePosition>;
}

const BORDER_COLOR: Record<AlertType, string> = {
  military_entry: "border-l-red-500",
  satellite_pass: "border-l-amber-400",
  camera_offline: "border-l-gray-400",
  info: "border-l-emerald-400",
};

const GLOW: Record<AlertType, string> = {
  military_entry: "shadow-red-500/20",
  satellite_pass: "shadow-amber-400/20",
  camera_offline: "shadow-gray-400/10",
  info: "shadow-emerald-400/10",
};

const ISS_NORAD_ID = 25544;
const AUTO_DISMISS_MS = 8_000;
const FADE_MS = 500;
const MAX_VISIBLE = 5;

export function AlertSystem({ aircraft, satellites }: AlertSystemProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [visible, setVisible] = useState(true);
  const seenIcaos = useRef(new Set<string>());
  const seenSatPasses = useRef(new Set<number>());

  const pushAlert = useCallback(
    (type: AlertType, title: string, message: string) => {
      const alert: Alert = {
        id: crypto.randomUUID(),
        type,
        title,
        message,
        timestamp: new Date(),
        fading: false,
      };
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_VISIBLE));
    },
    [],
  );

  useEffect(() => {
    aircraft.forEach((ac) => {
      if (ac.is_military && !seenIcaos.current.has(ac.icao)) {
        seenIcaos.current.add(ac.icao);
        pushAlert(
          "military_entry",
          "MILITARY AIRCRAFT DETECTED",
          `${ac.callsign ?? ac.icao} — ${ac.aircraft_type ?? "Unknown"} at ${Math.round(ac.altitude_m * 3.281)}ft`,
        );
      }
    });
  }, [aircraft, pushAlert]);

  useEffect(() => {
    const iss = satellites.get(ISS_NORAD_ID);
    if (!iss) return;
    const altAngle = 90 - Math.abs(iss.lat);
    if (altAngle > 30 && !seenSatPasses.current.has(ISS_NORAD_ID)) {
      seenSatPasses.current.add(ISS_NORAD_ID);
      pushAlert(
        "satellite_pass",
        "ISS OVERHEAD",
        `Altitude ${iss.altitude_km.toFixed(0)}km — Velocity ${iss.velocity_km_s.toFixed(1)}km/s`,
      );
    } else if (altAngle <= 30) {
      seenSatPasses.current.delete(ISS_NORAD_ID);
    }
  }, [satellites, pushAlert]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    alerts.forEach((a) => {
      if (a.fading) return;
      const fadeTimer = setTimeout(() => {
        setAlerts((prev) =>
          prev.map((x) => (x.id === a.id ? { ...x, fading: true } : x)),
        );
      }, AUTO_DISMISS_MS - FADE_MS);

      const removeTimer = setTimeout(() => {
        setAlerts((prev) => prev.filter((x) => x.id !== a.id));
      }, AUTO_DISMISS_MS);

      timers.push(fadeTimer, removeTimer);
    });

    return () => timers.forEach(clearTimeout);
  }, [alerts]);

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col items-end gap-2 w-80">
      <button
        onClick={() => setVisible((v) => !v)}
        className="mb-1 flex items-center gap-1.5 rounded bg-black/60 px-2.5 py-1 font-mono text-xs text-emerald-400 backdrop-blur-sm border border-emerald-400/20 hover:border-emerald-400/50 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.678 1.078h13.158a.75.75 0 00.678-1.078A11.944 11.944 0 0116 8a6 6 0 00-6-6zM8 18a2 2 0 104 0H8z" />
        </svg>
        {visible ? "HIDE" : "SHOW"} ALERTS
        {alerts.length > 0 && (
          <span className="ml-1 h-4 w-4 rounded-full bg-red-500 text-[10px] leading-4 text-center text-white">
            {alerts.length}
          </span>
        )}
      </button>

      {visible &&
        alerts.map((alert) => (
          <div
            key={alert.id}
            className={`w-full rounded border-l-4 ${BORDER_COLOR[alert.type]} bg-black/80 p-3 shadow-lg ${GLOW[alert.type]} backdrop-blur-md transition-opacity duration-500 ${alert.fading ? "opacity-0" : "opacity-100"}`}
          >
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]">
                {alert.title}
              </span>
              <span className="font-mono text-[9px] text-gray-500">
                {alert.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-gray-300">
              {alert.message}
            </p>
          </div>
        ))}
    </div>
  );
}
