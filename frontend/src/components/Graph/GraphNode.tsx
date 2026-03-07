import type { GraphNode as GraphNodeType } from "../../types/graph";

interface GraphNodeProps {
  node: GraphNodeType;
  isActive: boolean;
  onClick: (node: GraphNodeType) => void;
}

const DEFAULT_STYLE = {
  sigil: "◈",
  accent: "text-emerald-400",
  border: "border-emerald-500/30",
  badge: "bg-emerald-500/10 text-emerald-300",
  subtitle: "text-emerald-700/90",
};

const TABLE_STYLES: Record<string, typeof DEFAULT_STYLE> = {
  aircraft: {
    sigil: "✈",
    accent: "text-sky-300",
    border: "border-sky-400/30",
    badge: "bg-sky-500/10 text-sky-300",
    subtitle: "text-sky-200/70",
  },
  satellite: {
    sigil: "◌",
    accent: "text-amber-300",
    border: "border-amber-400/30",
    badge: "bg-amber-500/10 text-amber-300",
    subtitle: "text-amber-200/70",
  },
  camera: {
    sigil: "▣",
    accent: "text-violet-300",
    border: "border-violet-400/30",
    badge: "bg-violet-500/10 text-violet-300",
    subtitle: "text-violet-200/70",
  },
  zone: {
    sigil: "◎",
    accent: "text-emerald-300",
    border: "border-emerald-400/30",
    badge: "bg-emerald-500/10 text-emerald-300",
    subtitle: "text-emerald-200/70",
  },
  vessel: {
    sigil: "≈",
    accent: "text-cyan-300",
    border: "border-cyan-400/30",
    badge: "bg-cyan-500/10 text-cyan-300",
    subtitle: "text-cyan-200/70",
  },
  weather: {
    sigil: "◔",
    accent: "text-cyan-200",
    border: "border-cyan-300/30",
    badge: "bg-cyan-500/10 text-cyan-200",
    subtitle: "text-cyan-100/70",
  },
  fire_hotspot: {
    sigil: "✦",
    accent: "text-orange-300",
    border: "border-orange-400/30",
    badge: "bg-orange-500/10 text-orange-300",
    subtitle: "text-orange-200/70",
  },
  seismic_event: {
    sigil: "⋰",
    accent: "text-rose-300",
    border: "border-rose-400/30",
    badge: "bg-rose-500/10 text-rose-300",
    subtitle: "text-rose-200/70",
  },
  cyber_threat: {
    sigil: "⌘",
    accent: "text-fuchsia-300",
    border: "border-fuchsia-400/30",
    badge: "bg-fuchsia-500/10 text-fuchsia-300",
    subtitle: "text-fuchsia-200/70",
  },
};

function getTableStyle(table: string) {
  return TABLE_STYLES[table] ?? DEFAULT_STYLE;
}

export function GraphNode({ node, isActive, onClick }: GraphNodeProps) {
  const tableStyle = getTableStyle(node.ref.table);

  return (
    <button
      type="button"
      onClick={() => onClick(node)}
      className={`w-full rounded border px-2 py-1 text-left transition-colors ${
        isActive
          ? "border-emerald-400/70 bg-emerald-500/10"
          : "border-emerald-900/40 bg-black/50 hover:border-emerald-700/60"
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          aria-hidden="true"
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border bg-black/40 font-mono text-[10px] ${tableStyle.accent} ${tableStyle.border}`}
        >
          {tableStyle.sigil}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-emerald-300">{node.label}</span>
            <span
              className={`shrink-0 rounded border px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] ${tableStyle.border} ${tableStyle.badge}`}
            >
              {node.ref.table}
            </span>
          </div>
          {node.subtitle && (
            <div className={`mt-1 truncate text-[10px] ${tableStyle.subtitle}`}>{node.subtitle}</div>
          )}
          <div className="mt-1 font-mono text-[8px] text-emerald-900/80">{node.ref.id}</div>
        </div>
      </div>
    </button>
  );
}
