import type { SpaceWeatherAlert } from "../../types/spaceWeather";

interface SpaceWeatherPopupProps {
  kpIndex: number;
  alerts: SpaceWeatherAlert[];
  onClose: () => void;
  visible?: boolean;
}

function kpColor(kp: number): string {
  if (kp >= 7) return "#EF4444";
  if (kp >= 5) return "#F97316";
  if (kp >= 4) return "#EAB308";
  return "#22C55E";
}

export function SpaceWeatherPopup({
  kpIndex,
  alerts,
  onClose,
  visible,
}: SpaceWeatherPopupProps): React.ReactElement | null {
  if (visible === false) return null;
  const kpCol = kpColor(kpIndex);
  return (
    <div className="w-72 backdrop-blur-sm border rounded-lg shadow-xl bg-gray-800/95 border-gray-700/50">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: kpCol }}
          />
          <span className="text-sm font-bold text-gray-100 truncate">
            Space Weather
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Kp Index</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-bold rounded font-mono"
            style={{
              backgroundColor: kpCol + "33",
              color: kpCol,
            }}
          >
            Kp {kpIndex.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Storm level</span>
          <span className="text-gray-100 font-mono">
            {kpIndex >= 7
              ? "Severe (G3+)"
              : kpIndex >= 5
                ? "Moderate (G1-G2)"
                : kpIndex >= 4
                  ? "Minor"
                  : "Quiet"}
          </span>
        </div>
        {alerts.length > 0 && (
          <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
            <span className="text-gray-400 text-[10px] font-mono">
              ACTIVE ALERTS ({alerts.length})
            </span>
            <div className="max-h-32 overflow-y-auto space-y-1.5">
              {alerts.map((a) => (
                <div
                  key={a.product_id}
                  className="rounded bg-gray-900/50 px-2 py-1.5 text-[10px]"
                >
                  <div className="text-gray-300 line-clamp-3 font-mono">
                    {a.message.slice(0, 200)}
                  </div>
                  <div className="text-gray-500 font-mono mt-0.5">
                    {new Date(a.issue_time).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
