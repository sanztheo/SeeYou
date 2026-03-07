import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchGraphNeighbors,
  searchGraph,
} from "../services/graphService";
import type { GraphRef, GraphSearchResult, GraphSnapshot } from "../types/graph";

interface UseGraphNavigationOptions {
  onFlyTo?: (lat: number, lon: number) => void;
}

export interface UseGraphNavigationResult {
  focus: GraphRef | null;
  snapshot: GraphSnapshot | null;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  depth: 1 | 2;
  setDepth: (depth: 1 | 2) => void;
  canBack: boolean;
  canForward: boolean;
  goBack: () => void;
  goForward: () => void;
  focusEntity: (target: GraphRef) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: GraphSearchResult[];
  searching: boolean;
  runSearch: () => void;
  selectSearchResult: (result: GraphSearchResult) => void;
  reload: () => void;
}

export function useGraphNavigation(
  options: UseGraphNavigationOptions = {},
): UseGraphNavigationResult {
  const [history, setHistory] = useState<GraphRef[]>([]);
  const [index, setIndex] = useState(-1);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState<1 | 2>(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GraphSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<GraphRef[]>([]);
  const indexRef = useRef(-1);

  const focus = index >= 0 ? history[index] : null;

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const loadFocus = useCallback(
    async (target: GraphRef) => {
      loadAbortRef.current?.abort();
      const abortController = new AbortController();
      loadAbortRef.current = abortController;

      setLoading(true);
      setError(null);
      setUnavailable(false);

      try {
        const data = await fetchGraphNeighbors(
          target.table,
          target.id,
          depth,
          abortController.signal,
        );
        setSnapshot(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        const message = (err as Error).message;
        if (message.includes("503")) {
          setUnavailable(true);
        } else {
          setError(message);
        }
        setSnapshot(null);
      } finally {
        setLoading(false);
      }
    },
    [depth],
  );

  useEffect(() => {
    if (!focus) {
      setSnapshot(null);
      return;
    }
    void loadFocus(focus);
  }, [focus, depth, loadFocus]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);
  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const focusEntity = useCallback((target: GraphRef) => {
    const prevHistory = historyRef.current;
    const currentIndex = indexRef.current;
    const base =
      currentIndex >= 0 ? prevHistory.slice(0, currentIndex + 1) : [];
    const current = base[base.length - 1];

    if (current && current.table === target.table && current.id === target.id) {
      return;
    }

    const next = [...base, target];
    historyRef.current = next;
    indexRef.current = next.length - 1;
    setHistory(next);
    setIndex(next.length - 1);
  }, []);

  const goBack = useCallback(() => {
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goForward = useCallback(() => {
    setIndex((prev) => Math.min(history.length - 1, prev + 1));
  }, [history.length]);

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    searchAbortRef.current?.abort();
    const abortController = new AbortController();
    searchAbortRef.current = abortController;

    setSearching(true);
    try {
      const results = await searchGraph(query, abortController.signal);
      setSearchResults(results);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSearchResults([]);
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const selectSearchResult = useCallback(
    (result: GraphSearchResult) => {
      focusEntity(result.ref);
      if (
        typeof result.lat === "number" &&
        typeof result.lon === "number" &&
        options.onFlyTo
      ) {
        options.onFlyTo(result.lat, result.lon);
      }
    },
    [focusEntity, options],
  );

  const reload = useCallback(() => {
    if (!focus) return;
    void loadFocus(focus);
  }, [focus, loadFocus]);

  return useMemo(
    () => ({
      focus,
      snapshot,
      loading,
      unavailable,
      error,
      depth,
      setDepth,
      canBack: index > 0,
      canForward: index >= 0 && index < history.length - 1,
      goBack,
      goForward,
      focusEntity,
      searchQuery,
      setSearchQuery,
      searchResults,
      searching,
      runSearch,
      selectSearchResult,
      reload,
    }),
    [
      focus,
      snapshot,
      loading,
      unavailable,
      error,
      depth,
      index,
      history.length,
      goBack,
      goForward,
      focusEntity,
      searchQuery,
      searchResults,
      searching,
      runSearch,
      selectSearchResult,
      reload,
    ],
  );
}
