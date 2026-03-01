import { useState, useEffect, useRef, useCallback } from "react";
import type { Viewer } from "cesium";
import type { Road, TrafficFilter, BoundingBox } from "../../types/traffic";
import { fetchRoads, getCachedRoads } from "../../services/trafficService";
import { getViewerBbox, bboxKey } from "./trafficUtils";
import { MAX_ALT, LOAD_DEBOUNCE_MS } from "./trafficConstants";

export interface TrafficLoadState {
  roads: Road[];
  loading: boolean;
  roadCount: number;
  aboveMaxAlt: boolean;
}

export function useTrafficLoader(
  viewer: Viewer | undefined,
  filter: TrafficFilter,
): TrafficLoadState {
  const [roads, setRoads] = useState<Road[]>([]);
  const [loading, setLoading] = useState(false);
  const [aboveMaxAlt, setAboveMaxAlt] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef = useRef("");

  const loadForBbox = useCallback(
    async (bbox: BoundingBox, signal: AbortSignal) => {
      const key = bboxKey(bbox);
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;

      const cached = getCachedRoads(bbox);
      if (cached) {
        setRoads(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result = await fetchRoads(bbox, signal);
        if (!signal.aborted) {
          setRoads(result);
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[Traffic] load error:", err);
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!viewer || !filter.enabled) {
      setRoads([]);
      setLoading(false);
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
  };
}
