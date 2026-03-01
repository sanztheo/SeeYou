import type { Camera, CameraFilter } from "../../types/camera";

interface CameraFiltersProps {
  filter: CameraFilter;
  cameras: Camera[];
  onFilterChange: (filter: CameraFilter) => void;
}

export function CameraFilters({
  filter,
  cameras,
  onFilterChange,
}: CameraFiltersProps): React.ReactElement {
  const onlineCount = cameras.filter((c) => c.is_online).length;
  const cities = Array.from(new Set(cameras.map((c) => c.city))).sort();

  const toggleCity = (city: string): void => {
    const next = new Set(filter.cities);
    if (next.has(city)) next.delete(city);
    else next.add(city);
    onFilterChange({ ...filter, cities: next });
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Cameras
          </span>
          {cameras.length > 0 && (
            <span className="font-mono text-[9px] tabular-nums text-emerald-400">
              {onlineCount} online
            </span>
          )}
        </div>
        <button
          onClick={() =>
            onFilterChange({ ...filter, enabled: !filter.enabled })
          }
          className="shrink-0"
        >
          <div
            className={`h-3.5 w-7 rounded-full transition-colors ${filter.enabled ? "bg-emerald-500" : "bg-zinc-700"} relative`}
          >
            <div
              className={`absolute top-[2px] h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${filter.enabled ? "translate-x-[14px]" : "translate-x-[2px]"}`}
            />
          </div>
        </button>
      </div>

      {filter.enabled && cities.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto scrollbar-thin">
          {cities.map((city) => {
            const active = filter.cities.size === 0 || filter.cities.has(city);
            return (
              <button
                key={city}
                onClick={() => toggleCity(city)}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] border transition-colors ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {city}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
