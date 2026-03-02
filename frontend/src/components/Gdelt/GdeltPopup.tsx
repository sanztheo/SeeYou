import type { GdeltEvent } from "../../types/gdelt";

interface GdeltPopupProps {
  event: GdeltEvent | null;
  onClose: () => void;
}

function toneColor(tone: number): string {
  if (tone < -5) return "#EF4444";
  if (tone < -2) return "#F97316";
  if (tone < 0) return "#F59E0B";
  if (tone < 2) return "#EAB308";
  if (tone < 5) return "#84CC16";
  return "#22C55E";
}

export function GdeltPopup({
  event,
  onClose,
}: GdeltPopupProps): React.ReactElement | null {
  if (!event) return null;

  const tColor = toneColor(event.tone);

  return (
    <div className="w-72 backdrop-blur-sm border rounded-lg shadow-xl bg-gray-800/95 border-gray-700/50">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: "#A78BFA" }}
          />
          <span className="text-sm font-bold text-gray-100 truncate">
            {event.title}
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
          <span className="text-gray-400 shrink-0">Tone</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded font-mono"
            style={{ backgroundColor: tColor + "33", color: tColor }}
          >
            {event.tone > 0 ? "+" : ""}
            {event.tone.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Domain</span>
          <span className="text-gray-100 font-mono text-right truncate max-w-[160px]">
            {event.domain}
          </span>
        </div>
        {event.source_country && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Source country</span>
            <span className="text-gray-100 font-mono">
              {event.source_country}
            </span>
          </div>
        )}
        <div className="pt-1.5 mt-1.5 border-t border-gray-700/30 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Latitude</span>
            <span className="text-gray-100 font-mono">
              {event.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Longitude</span>
            <span className="text-gray-100 font-mono">
              {event.lon.toFixed(4)}°
            </span>
          </div>
        </div>
        {event.url && (
          <div className="pt-1.5 mt-1.5 border-t border-gray-700/30">
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Read article
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
