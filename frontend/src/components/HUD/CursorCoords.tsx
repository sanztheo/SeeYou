interface CursorCoordsProps {
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  sidebarOpen?: boolean;
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

export function CursorCoords({
  lat,
  lon,
  altitude,
  sidebarOpen,
}: CursorCoordsProps) {
  const left = sidebarOpen ? "left-[292px]" : "left-3";
  return (
    <div
      className={`fixed bottom-12 ${left} z-20 flex items-center gap-3 rounded-md border border-zinc-800/60 bg-zinc-950/70 px-3 py-1 font-mono text-[10px] text-emerald-400/80 backdrop-blur-md select-none transition-all`}
    >
      <span>
        LAT <span className="text-emerald-300">{fmt(lat, "N", "S")}</span>
      </span>
      <span className="text-zinc-700">|</span>
      <span>
        LON <span className="text-emerald-300">{fmt(lon, "E", "W")}</span>
      </span>
      <span className="text-zinc-700">|</span>
      <span>
        ALT <span className="text-emerald-300">{fmtAlt(altitude)}</span>
      </span>
    </div>
  );
}
