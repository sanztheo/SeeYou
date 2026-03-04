import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Cartesian2,
  Cartesian3,
  Color,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  DistanceDisplayCondition,
} from "cesium";
import type {
  TrafficFilter,
  TrafficIncident,
  BoundingBox,
} from "../../types/traffic";
import { fetchIncidents } from "../../services/trafficService";
import { getViewerBbox } from "./trafficUtils";
import { MAX_ALT, LOAD_DEBOUNCE_MS } from "./trafficConstants";

const INCIDENT_REFRESH_MS = 60_000;

const INCIDENT_COLORS: Record<string, Color> = {
  Accident: Color.RED,
  "Road Closed": Color.fromCssColorString("#B71C1C"),
  "Road Works": Color.ORANGE,
  Jam: Color.fromCssColorString("#FF5722"),
  "Lane Closed": Color.fromCssColorString("#FF9800"),
  Flooding: Color.fromCssColorString("#1565C0"),
  Ice: Color.fromCssColorString("#81D4FA"),
  Rain: Color.fromCssColorString("#42A5F5"),
  Wind: Color.fromCssColorString("#78909C"),
  Fog: Color.fromCssColorString("#9E9E9E"),
  "Dangerous Conditions": Color.fromCssColorString("#E65100"),
  "Broken Down Vehicle": Color.fromCssColorString("#795548"),
};

const INCIDENT_LABELS: Record<string, string> = {
  Accident: "ACC",
  "Road Closed": "CLO",
  "Road Works": "WRK",
  Jam: "JAM",
  "Lane Closed": "LNE",
  Flooding: "FLD",
  Ice: "ICE",
  Rain: "RN",
  Wind: "WND",
  Fog: "FOG",
  "Dangerous Conditions": "DNG",
  "Broken Down Vehicle": "BKN",
};

function incidentMatchesFilter(
  inc: TrafficIncident,
  filter: TrafficFilter,
): boolean {
  const t = inc.incident_type;
  if (t === "Accident" && !filter.showAccidents) return false;
  if (t === "Road Works" && !filter.showRoadWorks) return false;
  if ((t === "Road Closed" || t === "Lane Closed") && !filter.showClosures)
    return false;
  return true;
}

interface IncidentLayerProps {
  filter: TrafficFilter;
}

export function IncidentLayer({ filter }: IncidentLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBboxRef = useRef<string>("");
  const rawIncidentsRef = useRef<TrafficIncident[]>([]);

  const renderFiltered = useCallback(() => {
    const ds = dsRef.current;
    if (!ds) return;
    ds.entities.removeAll();

    for (let i = 0; i < rawIncidentsRef.current.length; i++) {
      const inc = rawIncidentsRef.current[i];
      if (!incidentMatchesFilter(inc, filter)) continue;

      const [lon, lat] = inc.start_point;
      const color =
        INCIDENT_COLORS[inc.incident_type] ??
        Color.fromCssColorString("#9E9E9E");
      const abbr = INCIDENT_LABELS[inc.incident_type] ?? "???";
      const severityScale = 8 + inc.severity * 2;

      ds.entities.add({
        id: `incident_${inc.id}`,
        position: Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: severityScale,
          color,
          outlineColor: Color.WHITE,
          outlineWidth: 1.5,
          scaleByDistance: new NearFarScalar(5_000, 1.2, 100_000, 0.4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, MAX_ALT),
        },
        label: {
          text: abbr,
          font: "bold 9px monospace",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          pixelOffset: new Cartesian2(0, -10),
          scaleByDistance: new NearFarScalar(5_000, 1.0, 100_000, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 30_000),
        },
        description: buildIncidentDescription(inc),
      });
    }
  }, [filter]);

  const loadIncidents = useCallback(
    async (bbox: BoundingBox, signal: AbortSignal) => {
      try {
        const incidents = await fetchIncidents(bbox, signal);
        if (signal.aborted) return;
        rawIncidentsRef.current = incidents;
        renderFiltered();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[IncidentLayer] load error:", err);
      }
    },
    [renderFiltered],
  );

  useEffect(() => {
    renderFiltered();
  }, [
    filter.showAccidents,
    filter.showRoadWorks,
    filter.showClosures,
    renderFiltered,
  ]);

  useEffect(() => {
    if (!viewer || !filter.enabled || !filter.showIncidents) return;

    const ds = new CustomDataSource("traffic-incidents");
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
      loadIncidents(bbox, ac.signal);
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
    }, INCIDENT_REFRESH_MS);

    return () => {
      viewer.camera.changed.removeEventListener(onCamera);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
      dsRef.current = null;
      rawIncidentsRef.current = [];
      lastBboxRef.current = "";
    };
  }, [viewer, filter.enabled, filter.showIncidents, loadIncidents]);

  return null;
}

function buildIncidentDescription(inc: TrafficIncident): string {
  const parts: string[] = [];
  parts.push(`<b>${inc.incident_type}</b>`);
  if (inc.description) parts.push(inc.description);
  if (inc.from_street && inc.to_street)
    parts.push(`${inc.from_street} → ${inc.to_street}`);
  else if (inc.road_name) parts.push(inc.road_name);
  if (inc.delay_seconds > 0)
    parts.push(`Delay: ${Math.round(inc.delay_seconds / 60)} min`);
  if (inc.length_meters > 0)
    parts.push(`Length: ${(inc.length_meters / 1000).toFixed(1)} km`);
  return parts.join("<br/>");
}
