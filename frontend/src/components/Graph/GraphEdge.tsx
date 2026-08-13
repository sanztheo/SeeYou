import type { GraphEdge as GraphEdgeType } from "../../types/graph";

interface GraphEdgeProps {
  edge: GraphEdgeType;
}

function formatScore(score: unknown): string | undefined {
  return typeof score === "number" ? score.toFixed(2) : undefined;
}

function formatExplainRule(explain: unknown): string | undefined {
  if (typeof explain !== "object" || explain === null) {
    return undefined;
  }
  const rule = (explain as Record<string, unknown>).rule;
  return typeof rule === "string" ? rule : undefined;
}

function formatTimestamp(timestamp: unknown): string | undefined {
  if (typeof timestamp !== "string") {
    return undefined;
  }
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toLocaleTimeString();
}

export function GraphEdge({ edge }: GraphEdgeProps) {
  const attributes = edge.attributes ?? undefined;
  const score = formatScore(attributes?.score);
  const rule = formatExplainRule(attributes?.explain);
  const timestamp = formatTimestamp(attributes?.timestamp);
  const explainTitle = attributes?.explain
    ? JSON.stringify(attributes.explain, null, 2)
    : undefined;

  return (
    <div className="rounded border border-emerald-900/40 bg-black/40 px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[9px] text-emerald-400">
          {edge.relation}
        </div>
        {score && (
          <span
            className="shrink-0 rounded border border-emerald-400/30 bg-emerald-500/10 px-1 py-0.5 font-mono text-[8px] text-emerald-300"
            title={explainTitle}
          >
            score {score}
          </span>
        )}
      </div>
      <div className="mt-1 text-[9px] text-emerald-700/90">
        {edge.from.table}:{edge.from.id} → {edge.to.table}:{edge.to.id}
      </div>
      {(rule || timestamp) && (
        <div
          className="mt-1 truncate font-mono text-[8px] text-emerald-900/80"
          title={explainTitle}
        >
          {[rule, timestamp].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
