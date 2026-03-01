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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Cameras
        </h3>
        <span className="text-[10px] font-mono text-green-400">
          {onlineCount} online
        </span>
      </div>

      <button
        onClick={() => onFilterChange({ ...filter, enabled: !filter.enabled })}
        className="flex items-center gap-2 w-full text-left text-sm text-gray-200 hover:text-gray-100 transition-colors"
      >
        <div
          className={`w-8 h-4 rounded-full transition-colors ${filter.enabled ? "bg-green-500" : "bg-gray-600"} relative`}
        >
          <div
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${filter.enabled ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </div>
        <span>Show cameras</span>
      </button>

      {filter.enabled && cities.length > 0 && (
        <div className="pl-2 space-y-1 max-h-32 overflow-y-auto">
          {cities.map((city) => {
            const active = filter.cities.size === 0 || filter.cities.has(city);
            return (
              <button
                key={city}
                onClick={() => toggleCity(city)}
                className={`block text-xs font-mono transition-colors ${active ? "text-gray-200" : "text-gray-600"} hover:text-gray-100`}
              >
                {active ? "◉" : "○"} {city}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
