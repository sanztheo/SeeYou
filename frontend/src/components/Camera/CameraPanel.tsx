import { useMemo } from "react";
import type { Camera } from "../../types/camera";

interface CameraPanelProps {
  cameras: Camera[];
  onSelect: (camera: Camera) => void;
}

function streamBadge(type: string): { label: string; color: string } {
  switch (type) {
    case "Hls":
    case "Mjpeg":
      return { label: "LIVE", color: "text-green-400 bg-green-400/10" };
    default:
      return { label: "IMG", color: "text-amber-400 bg-amber-400/10" };
  }
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
    // Sort cities, and within each city put LIVE streams first
    const entries = Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [, cams] of entries) {
      cams.sort((a, b) => {
        const aLive = a.stream_type !== "ImageRefresh" ? 0 : 1;
        const bLive = b.stream_type !== "ImageRefresh" ? 0 : 1;
        return aLive - bLive;
      });
    }
    return entries;
  }, [cameras]);

  const liveCount = useMemo(
    () => cameras.filter((c) => c.stream_type !== "ImageRefresh").length,
    [cameras],
  );

  if (cameras.length === 0) {
    return (
      <div className="text-xs text-gray-500 font-mono py-2">
        No cameras in view
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      <div className="flex items-center gap-2 px-1 pb-1 text-[10px] font-mono text-gray-500">
        <span>{cameras.length} online</span>
        <span className="text-gray-700">|</span>
        <span className="text-green-500">{liveCount} live</span>
        <span className="text-gray-700">|</span>
        <span className="text-amber-500">{cameras.length - liveCount} img</span>
      </div>
      {grouped.map(([city, cams]) => (
        <div key={city} className="mb-2">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1 py-0.5 sticky top-0 bg-gray-900/95 backdrop-blur-sm">
            {city} ({cams.length})
          </div>
          {cams.map((cam) => {
            const badge = streamBadge(cam.stream_type);
            return (
              <button
                key={cam.id}
                onClick={() => onSelect(cam)}
                className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-gray-700/40 transition-colors group"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                <span className="text-xs text-gray-300 font-mono truncate group-hover:text-gray-100 transition-colors">
                  {cam.name}
                </span>
                <span
                  className={`ml-auto px-1 py-px rounded text-[9px] font-bold flex-shrink-0 ${badge.color}`}
                >
                  {badge.label}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
