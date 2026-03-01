interface AircraftCounterProps {
  total: number;
  military: number;
  civilian: number;
}

export function AircraftCounter({
  total,
  military,
  civilian,
}: AircraftCounterProps): React.ReactElement {
  return (
    <div className="px-4 py-3 border-b border-zinc-800/60">
      <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        Aircraft
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Stat value={total} label="Total" color="text-zinc-100" />
        <Stat value={civilian} label="Civil" color="text-sky-400" />
        <Stat value={military} label="Mil" color="text-rose-400" />
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
      <div className={`font-mono text-base font-bold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
        {label}
      </div>
    </div>
  );
}
