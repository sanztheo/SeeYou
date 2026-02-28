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
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Aircraft
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <CountBox label="Total" count={total} color="text-gray-100" />
        <CountBox label="Civil" count={civilian} color="text-blue-400" />
        <CountBox label="Military" count={military} color="text-red-400" />
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
