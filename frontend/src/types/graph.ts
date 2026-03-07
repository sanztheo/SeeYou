export interface GraphRef {
  table: string;
  id: string;
}

export interface GraphNode {
  ref: GraphRef;
  label: string;
  subtitle?: string;
  lat?: number;
  lon?: number;
  entity?: Record<string, unknown>;
}

export interface GraphEdge {
  ref: GraphRef;
  relation: string;
  from: GraphRef;
  to: GraphRef;
  attributes?: Record<string, unknown> | null;
}

export interface GraphSnapshot {
  root: GraphRef;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated?: boolean;
}

export interface GraphSearchResult {
  ref: GraphRef;
  label: string;
  subtitle?: string;
  lat?: number;
  lon?: number;
}
