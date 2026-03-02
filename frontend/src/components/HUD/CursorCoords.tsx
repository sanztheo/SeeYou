interface CursorCoordsProps {
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  sidebarOpen?: boolean;
}

function fmt(deg: number | null, pos: string, neg: string): string {
  if (deg === null) return "---";
  const dir = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(4)}\u00b0 ${dir}`;
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
  const left = sidebarOpen ? "left-[316px]" : "left-[56px]";
  return (
    <div
      className={`fixed bottom-12 ${left} z-20 hud-bracket flex items-center gap-2 border border-emerald-900/30 bg-black/80 px-3 py-1 font-mono text-[10px] backdrop-blur-md select-none transition-all`}
    >
      <CField label="LAT" value={fmt(lat, "N", "S")} />
      <Sep />
      <CField label="LON" value={fmt(lon, "E", "W")} />
      <Sep />
      <CField label="ALT" value={fmtAlt(altitude)} />
    </div>
  );
}

function CField({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-emerald-800/60 text-[8px] tracking-widest">
        {label}
      </span>
      <span className="text-emerald-400 hud-glow tabular-nums">{value}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-emerald-900/40 text-[8px]">//</span>;
}
