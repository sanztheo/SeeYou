import type { GraphNode as GraphNodeType } from "../../types/graph";
import type { UseGraphNavigationResult } from "../../hooks/useGraphNavigation";
import { GraphEdge } from "./GraphEdge";
import { GraphNode } from "./GraphNode";

interface GraphViewProps {
  navigation: UseGraphNavigationResult;
  onSelectNode: (node: GraphNodeType) => void;
}

export function GraphView({ navigation, onSelectNode }: GraphViewProps) {
  const {
    focus,
    snapshot,
    loading,
    unavailable,
    error,
    depth,
    setDepth,
    canBack,
    canForward,
    goBack,
    goForward,
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    runSearch,
    selectSearchResult,
    reload,
  } = navigation;

  return (
    <div className="flex flex-col gap-2 p-1 text-emerald-200">
      <div className="grid grid-cols-4 gap-1">
        <button
          type="button"
          disabled={!canBack}
          onClick={goBack}
          className="rounded border border-emerald-900/40 px-2 py-1 text-[10px] disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canForward}
          onClick={goForward}
          className="rounded border border-emerald-900/40 px-2 py-1 text-[10px] disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => setDepth(1)}
          className={`rounded border px-2 py-1 text-[10px] ${depth === 1 ? "border-emerald-400/70" : "border-emerald-900/40"}`}
        >
          Depth 1
        </button>
        <button
          type="button"
          onClick={() => setDepth(2)}
          className={`rounded border px-2 py-1 text-[10px] ${depth === 2 ? "border-emerald-400/70" : "border-emerald-900/40"}`}
        >
          Depth 2
        </button>
      </div>

      <div className="flex gap-1">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search graph"
          className="w-full rounded border border-emerald-900/40 bg-black/50 px-2 py-1 text-[11px] outline-none focus:border-emerald-500/70"
        />
        <button
          type="button"
          onClick={runSearch}
          className="rounded border border-emerald-900/40 px-2 py-1 text-[10px]"
        >
          Go
        </button>
      </div>

      {searching && <div className="text-[10px] text-emerald-600">Searching…</div>}

      {searchResults.length > 0 && (
        <div className="max-h-24 overflow-y-auto rounded border border-emerald-900/40 bg-black/30 p-1">
          {searchResults.map((result) => (
            <button
              key={`${result.ref.table}:${result.ref.id}`}
              type="button"
              onClick={() => selectSearchResult(result)}
              className="mb-1 block w-full rounded border border-emerald-900/40 px-2 py-1 text-left text-[10px] hover:border-emerald-700/70"
            >
              <div className="text-emerald-300">{result.label}</div>
              <div className="font-mono text-[8px] text-emerald-700/80">
                {result.ref.table}:{result.ref.id}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px]">
        <span>
          {focus ? `${focus.table}:${focus.id}` : "Select an entity to open relations"}
        </span>
        <button
          type="button"
          onClick={reload}
          className="rounded border border-emerald-900/40 px-2 py-1"
        >
          Refresh
        </button>
      </div>

      {loading && <div className="text-[10px] text-emerald-500">Loading graph…</div>}
      {unavailable && (
        <div className="rounded border border-amber-700/40 bg-amber-500/10 p-2 text-[10px] text-amber-300">
          Graph backend unavailable (503).
        </div>
      )}
      {error && (
        <div className="rounded border border-red-700/40 bg-red-500/10 p-2 text-[10px] text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && !unavailable && snapshot && (
        <>
          {snapshot.nodes.length === 0 ? (
            <div className="text-[10px] text-emerald-700">No neighbors found.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {snapshot.nodes.map((node) => (
                <GraphNode
                  key={`${node.ref.table}:${node.ref.id}`}
                  node={node}
                  isActive={
                    !!focus &&
                    focus.table === node.ref.table &&
                    focus.id === node.ref.id
                  }
                  onClick={onSelectNode}
                />
              ))}
            </div>
          )}

          {snapshot.edges.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              {snapshot.edges.map((edge) => (
                <GraphEdge
                  key={`${edge.ref.table}:${edge.ref.id}:${edge.relation}`}
                  edge={edge}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
