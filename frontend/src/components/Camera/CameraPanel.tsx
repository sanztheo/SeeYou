import { useMemo } from "react";
import type { Camera } from "../../types/camera";

interface CameraPanelProps {
  cameras: Camera[];
  onSelect: (camera: Camera) => void;
}

export function CameraPanel({
  cameras,
  onSelect,
}: CameraPanelProps): React.ReactElement {
  const grouped = useMemo(() => {
    const map = new Map<string, Camera[]>();
    for (const cam of cameras) {
      const list = map.get(cam.city) ?? [];
      list.push(cam);
      map.set(cam.city, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [cameras]);

  if (cameras.length === 0) {
    return (
      <div className="text-xs text-gray-500 font-mono py-2">
        No cameras in view
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      {grouped.map(([city, cams]) => (
        <div key={city} className="mb-2">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1 py-0.5 sticky top-0 bg-gray-900/95 backdrop-blur-sm">
            {city} ({cams.length})
          </div>
          {cams.map((cam) => (
            <button
              key={cam.id}
              onClick={() => onSelect(cam)}
              className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-gray-700/40 transition-colors group"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  cam.is_online ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className="text-xs text-gray-300 font-mono truncate group-hover:text-gray-100 transition-colors">
                {cam.name}
              </span>
              <span className="ml-auto px-1 py-px rounded bg-gray-700/50 text-[9px] text-gray-500 font-bold uppercase flex-shrink-0">
                {cam.source}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
