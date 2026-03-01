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
    <div className="fixed top-3 right-3 z-30 flex items-center gap-3 rounded-md border border-zinc-800/60 bg-zinc-950/70 px-3 py-1.5 font-mono text-[10px] text-emerald-400/80 backdrop-blur-md select-none">
      <span>
        ALT <span className="text-emerald-300">{fmtAlt(altitude)}</span>
      </span>
      <span className="text-zinc-700">|</span>
      <span>
        HDG{" "}
        <span className="text-emerald-300">
          {heading.toFixed(0)}° {dir}
        </span>
      </span>
      <span className="text-zinc-700">|</span>
      <span>
        PIT <span className="text-emerald-300">{pitch.toFixed(1)}°</span>
      </span>
    </div>
  );
}
