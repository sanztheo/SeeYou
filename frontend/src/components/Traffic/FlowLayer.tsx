import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Cartesian3,
  Color,
  ColorMaterialProperty,
} from "cesium";
import type {
  TrafficFilter,
  FlowSegment,
  BoundingBox,
} from "../../types/traffic";
import { fetchFlowSegments } from "../../services/trafficService";
import { getViewerBbox } from "./trafficUtils";
import { MAX_ALT, LOAD_DEBOUNCE_MS } from "./trafficConstants";

const FLOW_REFRESH_MS = 120_000;

function congestionColor(current: number, freeFlow: number): Color {
  if (freeFlow <= 0) return Color.GRAY;
  const ratio = current / freeFlow;
  if (ratio > 0.8) return Color.fromCssColorString("#4CAF50").withAlpha(0.85);
  if (ratio > 0.4) return Color.fromCssColorString("#FF9800").withAlpha(0.85);
  return Color.fromCssColorString("#F44336").withAlpha(0.9);
}

function flowLineWidth(current: number, freeFlow: number): number {
  if (freeFlow <= 0) return 3;
  const ratio = current / freeFlow;
  if (ratio > 0.8) return 3;
  if (ratio > 0.4) return 4;
  return 5;
}

interface FlowLayerProps {
  filter: TrafficFilter;
}

export function FlowLayer({ filter }: FlowLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval>>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastBboxRef = useRef<string>("");

  const loadFlow = useCallback(
    async (bbox: BoundingBox, signal: AbortSignal) => {
      try {
        const segments = await fetchFlowSegments(bbox, signal);
        if (signal.aborted || !dsRef.current) return;
        renderFlow(segments, dsRef.current);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[FlowLayer] load error:", err);
      }
    },
    [],
  );

  useEffect(() => {
    if (!viewer || !filter.enabled || !filter.showFlowSegments) return;

    const ds = new CustomDataSource("traffic-flow");
    viewer.dataSources.add(ds);
    dsRef.current = ds;

    const triggerLoad = (): void => {
      if (viewer.isDestroyed()) return;
      const alt = viewer.camera.positionCartographic.height;
      if (alt > MAX_ALT) {
        ds.show = false;
        return;
      }
      ds.show = true;

      const bbox = getViewerBbox(viewer);
      if (!bbox) return;

      const key = `${bbox.south.toFixed(2)},${bbox.west.toFixed(2)},${bbox.north.toFixed(2)},${bbox.east.toFixed(2)}`;
      if (key === lastBboxRef.current) return;
      lastBboxRef.current = key;

      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      loadFlow(bbox, ac.signal);
    };

    const onCamera = (): void => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(triggerLoad, LOAD_DEBOUNCE_MS);
    };

    viewer.camera.changed.addEventListener(onCamera);
    triggerLoad();

    refreshRef.current = setInterval(() => {
      lastBboxRef.current = "";
      triggerLoad();
    }, FLOW_REFRESH_MS);

    return () => {
      viewer.camera.changed.removeEventListener(onCamera);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
      dsRef.current = null;
      lastBboxRef.current = "";
    };
  }, [viewer, filter.enabled, filter.showFlowSegments, loadFlow]);

  return null;
}

function renderFlow(segments: FlowSegment[], ds: CustomDataSource): void {
  ds.entities.removeAll();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.coordinates.length < 2) continue;

    const positions = Cartesian3.fromDegreesArray(
      seg.coordinates.flatMap(([lon, lat]) => [lon, lat]),
    );

    const color = congestionColor(seg.current_speed, seg.free_flow_speed);
    const width = flowLineWidth(seg.current_speed, seg.free_flow_speed);

    ds.entities.add({
      id: `flow_${i}`,
      polyline: {
        positions,
        width,
        material: new ColorMaterialProperty(color),
        clampToGround: true,
      },
      description: `Speed: ${Math.round(seg.current_speed)} / ${Math.round(seg.free_flow_speed)} km/h`,
    });
  }
}
