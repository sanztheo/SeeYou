import type {
  NaturalEvent,
  EventFilter,
  EventCategory,
} from "../../types/events";
import {
  ALL_EVENT_CATEGORIES,
  EVENT_CATEGORY_COLORS,
  EVENT_CATEGORY_LABELS,
} from "../../types/events";

interface EventFiltersProps {
  filter: EventFilter;
  events: NaturalEvent[];
  onFilterChange: (f: EventFilter) => void;
}

export function EventFilters({
  filter,
  events,
  onFilterChange,
}: EventFiltersProps): React.ReactElement {
  const visibleCount =
    filter.categories.size > 0
      ? events.filter((e) => filter.categories.has(e.category)).length
      : events.length;

  const toggleCategory = (cat: EventCategory): void => {
    const next = new Set(filter.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onFilterChange({ ...filter, categories: next });
  };

  const countByCategory = (cat: EventCategory): number =>
    events.filter((e) => e.category === cat).length;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Events
          </span>
          {filter.enabled && events.length > 0 && (
            <span className="font-mono text-[9px] tabular-nums text-emerald-400">
              {visibleCount}
            </span>
          )}
        </div>
        <button
          onClick={() =>
            onFilterChange({ ...filter, enabled: !filter.enabled })
          }
          className="shrink-0"
          role="switch"
          aria-checked={filter.enabled}
          aria-label="Toggle events layer"
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

      {filter.enabled && events.length === 0 && (
        <span className="font-mono text-[9px] text-zinc-600">
          Loading events…
        </span>
      )}

      {filter.enabled && events.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto scrollbar-thin">
          {ALL_EVENT_CATEGORIES.map((cat) => {
            const count = countByCategory(cat);
            if (count === 0) return null;
            const active =
              filter.categories.size === 0 || filter.categories.has(cat);
            const color = EVENT_CATEGORY_COLORS[cat];
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] border transition-colors ${
                  active
                    ? "text-white"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                }`}
                style={
                  active
                    ? {
                        borderColor: `${color}66`,
                        backgroundColor: `${color}1A`,
                        color,
                      }
                    : undefined
                }
              >
                {EVENT_CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
