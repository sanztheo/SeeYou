interface NvgHudProps {
  lat?: number;
  lon?: number;
  alt?: number;
}

function fmtCoord(deg: number, pos: string, neg: string): string {
  const dir = deg >= 0 ? pos : neg;
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = ((a - d - m / 60) * 3600).toFixed(1);
  return `${dir} ${String(d).padStart(2, "0")}°${String(m).padStart(2, "0")}'${s}"`;
}

export function NvgHud({ lat, lon, alt }: NvgHudProps): React.ReactElement {
  const latStr = lat != null ? fmtCoord(lat, "N", "S") : "N --°--'--.-\"";
  const lonStr = lon != null ? fmtCoord(lon, "E", "W") : "E ---°--'--.-\"";
  const altStr = alt != null ? `${Math.round(alt)} m` : "---- m";

  return (
    <div className="pointer-events-none fixed inset-0 z-40 border border-emerald-500/30">
      {/* Top-left data block */}
      <div className="absolute left-4 top-4 font-mono text-[11px] leading-relaxed text-emerald-400/90">
        <div className="mb-1 text-xs font-bold tracking-widest">NVG</div>
        <div>{latStr}</div>
        <div>{lonStr}</div>
        <div>ALT {altStr}</div>
      </div>

      {/* Center crosshair */}
      <svg
        className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 64 64"
      >
        <circle
          cx="32"
          cy="32"
          r="14"
          fill="none"
          stroke="rgba(52,211,153,0.45)"
          strokeWidth="1"
        />
        <line
          x1="32"
          y1="6"
          x2="32"
          y2="24"
          stroke="rgba(52,211,153,0.5)"
          strokeWidth="1"
        />
        <line
          x1="32"
          y1="40"
          x2="32"
          y2="58"
          stroke="rgba(52,211,153,0.5)"
          strokeWidth="1"
        />
        <line
          x1="6"
          y1="32"
          x2="24"
          y2="32"
          stroke="rgba(52,211,153,0.5)"
          strokeWidth="1"
        />
        <line
          x1="40"
          y1="32"
          x2="58"
          y2="32"
          stroke="rgba(52,211,153,0.5)"
          strokeWidth="1"
        />
        <circle cx="32" cy="32" r="2" fill="rgba(52,211,153,0.6)" />
      </svg>

      {/* Bottom-right timestamp */}
      <div className="absolute bottom-4 right-4 font-mono text-[10px] text-emerald-500/50">
        GAIN: AUTO &nbsp; IR: OFF
      </div>
    </div>
  );
}
