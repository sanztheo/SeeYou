import type { SatelliteCategory } from "../../types/satellite";

type CategoryCounts = Record<SatelliteCategory, number>;

interface SatelliteCounterProps {
  total: number;
  categoryCounts: CategoryCounts;
}

export function SatelliteCounter({
  total,
  categoryCounts,
}: SatelliteCounterProps): React.ReactElement {
  return (
    <div className="px-4 py-3 border-b border-zinc-800/60">
      <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        Satellites
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Stat value={total} label="Total" color="text-zinc-100" />
        <Stat
          value={categoryCounts.Station}
          label="Station"
          color="text-amber-400"
        />
        <Stat
          value={categoryCounts.Military}
          label="Mil"
          color="text-rose-400"
        />
        <Stat
          value={categoryCounts.Starlink}
          label="Starlink"
          color="text-cyan-400"
        />
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className={`font-mono text-sm font-bold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">
        {label}
      </div>
    </div>
  );
}
