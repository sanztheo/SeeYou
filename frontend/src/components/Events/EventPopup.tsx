import type { NaturalEvent, EventCategory } from "../../types/events";
import {
  EVENT_CATEGORY_COLORS,
  EVENT_CATEGORY_LABELS,
} from "../../types/events";

const CATEGORY_BADGE: Record<EventCategory, { bg: string; text: string }> = {
  Wildfires: { bg: "bg-red-500/20", text: "text-red-400" },
  SevereStorms: { bg: "bg-violet-500/20", text: "text-violet-400" },
  Volcanoes: { bg: "bg-orange-500/20", text: "text-orange-400" },
  Earthquakes: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  Floods: { bg: "bg-blue-500/20", text: "text-blue-400" },
  SeaAndLakeIce: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  Other: { bg: "bg-gray-500/20", text: "text-emerald-800/60" },
};

interface EventPopupProps {
  event: NaturalEvent | null;
  onClose: () => void;
}

export function EventPopup({
  event,
  onClose,
}: EventPopupProps): React.ReactElement | null {
  if (!event) return null;

  const badge = CATEGORY_BADGE[event.category] ?? CATEGORY_BADGE.Other;
  const color =
    EVENT_CATEGORY_COLORS[event.category] ?? EVENT_CATEGORY_COLORS.Other;
  const label = EVENT_CATEGORY_LABELS[event.category] ?? event.category;

  return (
    <div className="w-full backdrop-blur-md border border-emerald-900/30 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/90">
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/20">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-bold text-emerald-300 truncate">
            {event.title}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-emerald-900/20 text-emerald-800/60 hover:text-emerald-400 transition-colors"
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
          <span className="text-emerald-800/60 shrink-0">Category</span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${badge.bg} ${badge.text}`}
          >
            {label.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-emerald-800/60 shrink-0">Date</span>
          <span className="text-emerald-300 font-mono text-right">
            {event.date}
          </span>
        </div>

        <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Latitude</span>
            <span className="text-emerald-300 font-mono text-right">
              {event.lat.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-emerald-800/60 shrink-0">Longitude</span>
            <span className="text-emerald-300 font-mono text-right">
              {event.lon.toFixed(4)}°
            </span>
          </div>
        </div>

        {event.source_url && (
          <div className="pt-1.5 mt-1.5 border-t border-emerald-900/20">
            <a
              href={event.source_url}
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
              View source
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
