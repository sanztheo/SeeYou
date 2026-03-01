import { useState, useEffect, useRef, useCallback } from "react";
import type { Viewer } from "cesium";
import type { Road, TrafficFilter, BoundingBox } from "../../types/traffic";
import {
  fetchRoadsChunked,
  getCachedRoads,
  type RoadChunkProgress,
} from "../../services/trafficService";
import { getViewerBbox, bboxKey, bboxContains } from "./trafficUtils";
import { MAX_ALT, LOAD_DEBOUNCE_MS } from "./trafficConstants";

export interface TrafficLoadState {
  roads: Road[];
  loading: boolean;
  roadCount: number;
  aboveMaxAlt: boolean;
  progress: RoadChunkProgress;
}

const DONE_PROGRESS: RoadChunkProgress = { loaded: 0, total: 0, done: true };

export function useTrafficLoader(
  viewer: Viewer | undefined,
  filter: TrafficFilter,
): TrafficLoadState {
  const [roads, setRoads] = useState<Road[]>([]);
  const [loading, setLoading] = useState(false);
  const [aboveMaxAlt, setAboveMaxAlt] = useState(false);
  const [progress, setProgress] = useState<RoadChunkProgress>(DONE_PROGRESS);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef = useRef("");
  const loadingBboxRef = useRef<BoundingBox | null>(null);

  const loadForBbox = useCallback((bbox: BoundingBox, signal: AbortSignal) => {
    const key = bboxKey(bbox);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const cached = getCachedRoads(bbox);
    if (cached) {
      loadingBboxRef.current = null;
      setRoads(cached);
      setLoading(false);
      setProgress({ loaded: cached.length, total: cached.length, done: true });
      return;
    }

    loadingBboxRef.current = bbox;
    setLoading(true);
    setProgress({ loaded: 0, total: 0, done: false });

    fetchRoadsChunked(
      bbox,
      (chunk, prog) => {
        if (signal.aborted) return;
        setRoads(chunk);
        setProgress(prog);
        if (prog.done) {
          loadingBboxRef.current = null;
          setLoading(false);
        }
      },
      signal,
    ).catch((err) => {
      loadingBboxRef.current = null;
      lastKeyRef.current = "";
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[Traffic] load error:", err);
      setLoading(false);
      setProgress(DONE_PROGRESS);
    });
  }, []);

  useEffect(() => {
    if (!viewer || !filter.enabled) {
      setRoads([]);
      setLoading(false);
      setProgress(DONE_PROGRESS);
      loadingBboxRef.current = null;
      return;
    }

    const onCamera = (): void => {
      if (viewer.isDestroyed()) return;

      const alt = viewer.camera.positionCartographic.height;
      const tooHigh = alt > MAX_ALT;
      setAboveMaxAlt(tooHigh);

      if (tooHigh) return;

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        if (viewer.isDestroyed()) return;
        const bbox = getViewerBbox(viewer);
        if (!bbox) return;

        // Already fetching a bbox that covers this viewport — let it finish
        if (
          loadingBboxRef.current &&
          bboxContains(loadingBboxRef.current, bbox)
        ) {
          return;
        }

        // Cache already covers this viewport — use it without aborting
        const cached = getCachedRoads(bbox);
        if (cached) {
          setRoads(cached);
          setProgress({
            loaded: cached.length,
            total: cached.length,
            done: true,
          });
          setLoading(false);
          lastKeyRef.current = bboxKey(bbox);
          return;
        }

        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        loadForBbox(bbox, ac.signal);
      }, LOAD_DEBOUNCE_MS);
    };

    viewer.camera.changed.addEventListener(onCamera);
    onCamera();

    return () => {
      viewer.camera.changed.removeEventListener(onCamera);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [viewer, filter.enabled, loadForBbox]);

  return {
    roads,
    loading,
    roadCount: roads.length,
    aboveMaxAlt,
    progress,
  };
}
