import { useState, useMemo } from "react";

type Status = "online" | "loading" | "error" | "offline";

export interface ApiStatusEntry {
  name: string;
  status: Status;
  lastUpdate?: Date;
  count?: number;
}

interface ApiStatusProps {
  entries: ApiStatusEntry[];
}

const STATUS_COLOR: Record<Status, string> = {
  online: "bg-emerald-500",
  loading: "bg-amber-500",
  error: "bg-red-500",
  offline: "bg-zinc-600",
};

const STATUS_LABEL: Record<Status, string> = {
  online: "ONLINE",
  loading: "SYNC",
  error: "ERROR",
  offline: "OFF",
};

function formatAge(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function ApiStatus({ entries }: ApiStatusProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const allHealthy = useMemo(
    () => entries.every((e) => e.status === "online"),
    [entries],
  );

  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-900/60">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <div className="flex gap-0.5">
          {entries.map((e) => (
            <span
              key={e.name}
              className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[e.status]} ${e.status === "loading" ? "animate-pulse" : ""}`}
            />
          ))}
        </div>
        <span className="flex-1">{allHealthy ? "All Systems" : "Status"}</span>
        <span className="text-[10px] text-zinc-600">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 px-2 py-1 space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center gap-2 font-mono text-[10px] text-zinc-400"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[entry.status]} ${entry.status === "loading" ? "animate-pulse" : ""}`}
              />
              <span className="flex-1 truncate uppercase tracking-wider">
                {entry.name}
              </span>
              <span className="text-zinc-600">
                {STATUS_LABEL[entry.status]}
              </span>
              {entry.count != null && (
                <span className="tabular-nums text-zinc-500">
                  [{entry.count}]
                </span>
              )}
              {entry.lastUpdate && (
                <span className="text-zinc-600">
                  {formatAge(entry.lastUpdate)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
