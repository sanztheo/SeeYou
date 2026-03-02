interface CameraInfoProps {
  altitude: number;
  heading: number;
  pitch: number;
}

const COMPASS: [number, string][] = [
  [22.5, "N"],
  [67.5, "NE"],
  [112.5, "E"],
  [157.5, "SE"],
  [202.5, "S"],
  [247.5, "SW"],
  [292.5, "W"],
  [337.5, "NW"],
  [360, "N"],
];

function compassDir(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  for (const [limit, label] of COMPASS) {
    if (norm < limit) return label;
  }
  return "N";
}

function fmtAlt(m: number): string {
  if (m >= 1_000_000) return `${(m / 1000).toFixed(0)}km`;
  if (m >= 10_000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}

export function CameraInfo({ altitude, heading, pitch }: CameraInfoProps) {
  const dir = compassDir(heading);
  return (
    <div className="hud-bracket flex items-center gap-2 border border-emerald-900/30 bg-black/80 px-3 py-1.5 font-mono text-[10px] backdrop-blur-md select-none">
      <HudField label="ALT" value={fmtAlt(altitude)} />
      <Sep />
      <HudField label="HDG" value={`${heading.toFixed(0)}\u00b0 ${dir}`} />
      <Sep />
      <HudField label="PIT" value={`${pitch.toFixed(1)}\u00b0`} />
    </div>
  );
}

function HudField({ label, value }: { label: string; value: string }) {
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
