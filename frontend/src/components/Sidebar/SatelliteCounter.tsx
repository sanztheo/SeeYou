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
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Satellites
      </h3>
      <div className="grid grid-cols-4 gap-2">
        <CountBox label="Total" count={total} color="text-gray-100" />
        <CountBox
          label="Station"
          count={categoryCounts.Station}
          color="text-yellow-400"
        />
        <CountBox
          label="Military"
          count={categoryCounts.Military}
          color="text-red-400"
        />
        <CountBox
          label="Starlink"
          count={categoryCounts.Starlink}
          color="text-cyan-400"
        />
      </div>
    </div>
  );
}

function CountBox({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}): React.ReactElement {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{count}</div>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    </div>
  );
}
