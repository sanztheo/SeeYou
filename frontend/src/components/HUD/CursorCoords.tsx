interface CursorCoordsProps {
  lat: number | null;
  lon: number | null;
  altitude: number | null;
}

function fmt(deg: number | null, pos: string, neg: string): string {
  if (deg === null) return "---";
  const dir = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(4)}° ${dir}`;
}

function fmtAlt(m: number | null): string {
  if (m === null) return "---";
  if (m >= 10_000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}

export function CursorCoords({ lat, lon, altitude }: CursorCoordsProps) {
  return (
    <div className="fixed bottom-4 left-4 z-40 rounded bg-black/70 px-3 py-1.5 font-mono text-xs text-emerald-400 backdrop-blur-sm border border-emerald-400/15 select-none shadow-lg shadow-emerald-400/5">
      <div className="flex gap-4 items-center">
        <span>
          LAT{" "}
          <span className="text-emerald-300 drop-shadow-[0_0_3px_rgba(52,211,153,0.35)]">
            {fmt(lat, "N", "S")}
          </span>
        </span>
        <span>
          LON{" "}
          <span className="text-emerald-300 drop-shadow-[0_0_3px_rgba(52,211,153,0.35)]">
            {fmt(lon, "E", "W")}
          </span>
        </span>
        <span>
          ALT{" "}
          <span className="text-emerald-300 drop-shadow-[0_0_3px_rgba(52,211,153,0.35)]">
            {fmtAlt(altitude)}
          </span>
        </span>
      </div>
    </div>
  );
}
