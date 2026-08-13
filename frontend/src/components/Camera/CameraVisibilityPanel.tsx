import { useEffect, useState } from "react";
import { API_URL } from "../../lib/constants";
import type {
  AircraftCamerasResponse,
  CameraSighting,
  OpticalLevel,
  PredictedCameraSighting,
} from "../../types/cameraVisibility";

interface CameraVisibilityPanelProps {
  icao: string;
}

// Refetch cadence while the popup stays open. The backend recomputes from
// the live predictor on every call (SeeYou v2 P2 §"Prédiction de passage":
// "recalcul client à chaque nouvelle position WS — pas de push WS par
// seconde") — polling is the closest this leaf component can get to that
// without new props threaded down from the WS tick (out of this lot's file
// scope).
const REFRESH_INTERVAL_MS = 20_000;

const LEVEL_BADGE: Record<OpticalLevel, { label: string; className: string }> =
  {
    recognition: {
      label: "RECOGNITION",
      className: "text-green-400 bg-green-400/10",
    },
    detection: {
      label: "DETECTION",
      className: "text-amber-400 bg-amber-400/10",
    },
    proximity: {
      label: "PROXIMITY ONLY",
      className: "text-slate-400 bg-slate-400/10",
    },
  };

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const minutes = Math.floor(secs / 60);
  const seconds = Math.round(secs % 60);
  return `${minutes}m ${seconds}s`;
}

function LevelBadge({ level }: { level: OpticalLevel }): React.ReactElement {
  const badge = LEVEL_BADGE[level];
  return (
    <span
      className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

function GeometryLine({
  geometry,
}: {
  geometry: CameraSighting["geometry"];
}): React.ReactElement {
  return (
    <span className="text-cyan-800/70">
      az {Math.round(geometry.bearing_deg)}° · el{" "}
      {Math.round(geometry.elevation_deg)}° ·{" "}
      {(geometry.slant_distance_m / 1000).toFixed(1)} km
    </span>
  );
}

function SeeingNowRow({
  sighting,
}: {
  sighting: CameraSighting;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 py-1 border-b border-cyan-900/10 last:border-0">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-cyan-300 truncate">{sighting.camera_name}</span>
        <LevelBadge level={sighting.level} />
      </div>
      <GeometryLine geometry={sighting.geometry} />
    </div>
  );
}

function WillSeeRow({
  sighting,
}: {
  sighting: PredictedCameraSighting;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 py-1 border-b border-cyan-900/10 last:border-0">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-cyan-300 truncate">{sighting.camera_name}</span>
        <LevelBadge level={sighting.level} />
      </div>
      <div className="flex items-center justify-between gap-1.5 text-cyan-800/70">
        <span>
          T-{formatDuration(sighting.t_minus_secs)} · lasts{" "}
          {formatDuration(sighting.duration_secs)}
        </span>
        <GeometryLine geometry={sighting.geometry} />
      </div>
    </div>
  );
}

/**
 * Self-fetching panel: which cameras see this aircraft now, and which will
 * see it soon (`GET /aircraft/:icao/cameras`, SeeYou v2 P2 Lot 6). Renders
 * inside `AircraftPopup` — fetches on its own so no data-fetching wiring is
 * needed in the parent state hooks.
 */
export function CameraVisibilityPanel({
  icao,
}: CameraVisibilityPanelProps): React.ReactElement | null {
  const [data, setData] = useState<AircraftCamerasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const res = await fetch(`${API_URL}/aircraft/${icao}/cameras`, {
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          setLoading(false);
          return;
        }
        const body: AircraftCamerasResponse = await res.json();
        if (cancelled) return;
        setData(body);
        setError(false);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    // No synchronous setState here: `loading` already starts `true` on
    // first mount, and the caller keys this component by `icao` so a
    // change of aircraft remounts it (fresh `useState` initial values)
    // instead of needing an explicit reset.
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [icao]);

  if (loading && !data) {
    return (
      <div className="text-[10px] text-cyan-800/50 italic py-1">
        Checking camera coverage...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-[10px] text-cyan-800/50 italic py-1">
        Camera coverage unavailable
      </div>
    );
  }

  if (!data) return null;

  if (data.filtered_reason === "cruise_altitude") {
    return (
      <div className="text-[10px] text-cyan-800/60 py-1">{data.notes[0]}</div>
    );
  }

  const hasSightings = data.seeing_now.length > 0 || data.will_see.length > 0;

  return (
    <div className="space-y-2">
      {data.seeing_now.length > 0 && (
        <div>
          <span className="text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
            Seeing now ({data.seeing_now.length})
          </span>
          <div className="mt-1">
            {data.seeing_now.map((s) => (
              <SeeingNowRow key={s.camera_id} sighting={s} />
            ))}
          </div>
        </div>
      )}

      {data.will_see.length > 0 && (
        <div>
          <span className="text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
            Will see ({data.will_see.length})
          </span>
          <div className="mt-1">
            {data.will_see.map((s) => (
              // camera_id alone isn't unique: a camera that drops out and
              // reacquires the aircraft produces two distinct windows.
              <WillSeeRow
                key={`${s.camera_id}-${s.t_minus_secs}`}
                sighting={s}
              />
            ))}
          </div>
        </div>
      )}

      {!hasSightings && (
        <div className="text-[10px] text-cyan-800/50 italic py-1">
          No camera coverage nearby
        </div>
      )}

      {data.notes.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t border-cyan-900/10">
          {data.notes.map((note) => (
            <div
              key={note}
              className="text-[9px] text-cyan-800/50 leading-tight"
            >
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
