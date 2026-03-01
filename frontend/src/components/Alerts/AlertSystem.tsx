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

const ACCENT: Record<AlertType, string> = {
  military_entry: "border-l-rose-500",
  satellite_pass: "border-l-amber-400",
  camera_offline: "border-l-zinc-500",
  info: "border-l-emerald-400",
};

const ISS_NORAD_ID = 25544;
const AUTO_DISMISS_MS = 8_000;
const FADE_MS = 500;
const MAX_VISIBLE = 4;

export function AlertSystem({ aircraft, satellites }: AlertSystemProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const seenIcaos = useRef(new Set<string>());
  const seenSatPasses = useRef(new Set<number>());

  const pushAlert = useCallback(
    (type: AlertType, title: string, message: string) => {
      setAlerts((prev) =>
        [
          {
            id: crypto.randomUUID(),
            type,
            title,
            message,
            timestamp: new Date(),
            fading: false,
          },
          ...prev,
        ].slice(0, MAX_VISIBLE),
      );
    },
    [],
  );

  useEffect(() => {
    aircraft.forEach((ac) => {
      if (ac.is_military && !seenIcaos.current.has(ac.icao)) {
        seenIcaos.current.add(ac.icao);
        pushAlert(
          "military_entry",
          "MIL AIRCRAFT",
          `${ac.callsign ?? ac.icao} — ${ac.aircraft_type ?? "?"} at ${Math.round(ac.altitude_m * 3.281)}ft`,
        );
      }
    });
  }, [aircraft, pushAlert]);

  useEffect(() => {
    const iss = satellites.get(ISS_NORAD_ID);
    if (!iss) return;
    const alt = 90 - Math.abs(iss.lat);
    if (alt > 30 && !seenSatPasses.current.has(ISS_NORAD_ID)) {
      seenSatPasses.current.add(ISS_NORAD_ID);
      pushAlert(
        "satellite_pass",
        "ISS OVERHEAD",
        `Alt ${iss.altitude_km.toFixed(0)}km — ${iss.velocity_km_s.toFixed(1)}km/s`,
      );
    } else if (alt <= 30) {
      seenSatPasses.current.delete(ISS_NORAD_ID);
    }
  }, [satellites, pushAlert]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    alerts.forEach((a) => {
      if (a.fading) return;
      timers.push(
        setTimeout(
          () =>
            setAlerts((p) =>
              p.map((x) => (x.id === a.id ? { ...x, fading: true } : x)),
            ),
          AUTO_DISMISS_MS - FADE_MS,
        ),
        setTimeout(
          () => setAlerts((p) => p.filter((x) => x.id !== a.id)),
          AUTO_DISMISS_MS,
        ),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [alerts]);

  return (
    <div className="flex flex-col items-end gap-1.5 w-72">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-800/60 bg-zinc-950/70 px-2 py-1 font-mono text-[9px] text-emerald-400/80 backdrop-blur-md transition-colors hover:border-emerald-500/40"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3 w-3"
        >
          <path d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.678 1.078h13.158a.75.75 0 00.678-1.078A11.944 11.944 0 0116 8a6 6 0 00-6-6zM8 18a2 2 0 104 0H8z" />
        </svg>
        {collapsed ? "SHOW" : "HIDE"}
        {alerts.length > 0 && (
          <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] text-white">
            {alerts.length}
          </span>
        )}
      </button>

      {!collapsed &&
        alerts.map((alert) => (
          <div
            key={alert.id}
            className={`w-full rounded-md border-l-2 ${ACCENT[alert.type]} border border-zinc-800/60 bg-zinc-950/80 p-2.5 shadow-lg backdrop-blur-md transition-opacity duration-500 ${alert.fading ? "opacity-0" : "opacity-100"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                {alert.title}
              </span>
              <span className="font-mono text-[8px] text-zinc-600">
                {alert.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
              {alert.message}
            </p>
          </div>
        ))}
    </div>
  );
}
