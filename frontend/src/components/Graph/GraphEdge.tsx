import type { GraphEdge as GraphEdgeType } from "../../types/graph";

interface GraphEdgeProps {
  edge: GraphEdgeType;
}

export function GraphEdge({ edge }: GraphEdgeProps) {
  return (
    <div className="rounded border border-emerald-900/40 bg-black/40 px-2 py-1">
      <div className="font-mono text-[9px] text-emerald-400">{edge.relation}</div>
      <div className="mt-1 text-[9px] text-emerald-700/90">
        {edge.from.table}:{edge.from.id} → {edge.to.table}:{edge.to.id}
      </div>
    </div>
  );
}
