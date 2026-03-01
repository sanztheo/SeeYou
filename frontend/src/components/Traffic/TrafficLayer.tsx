import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Cartesian3,
  Color,
  Math as CesiumMath,
  type Viewer,
} from "cesium";
import type { Road, TrafficFilter, RoadType } from "../../types/traffic";
import { fetchRoads } from "../../services/trafficService";
import { ParticleEngine } from "./ParticleEngine";

const MAX_ALT = 50_000;
const DEBOUNCE_MS = 500;

const ROAD_COLOR: Record<RoadType, Color> = {
  Motorway: Color.fromCssColorString("#FFEB3B"),
  Trunk: Color.fromCssColorString("#FF9800"),
  Primary: Color.WHITE,
  Secondary: Color.GRAY,
  Tertiary: Color.DARKGRAY,
};

const ROAD_WIDTH: Record<RoadType, number> = {
  Motorway: 4,
  Trunk: 3,
  Primary: 2,
  Secondary: 1,
  Tertiary: 1,
};

interface TrafficLayerProps {
  filter: TrafficFilter;
  roads: Road[];
}

function typeVisible(f: TrafficFilter, t: RoadType): boolean {
  if (t === "Motorway") return f.showMotorway;
  if (t === "Trunk") return f.showTrunk;
  if (t === "Primary") return f.showPrimary;
  if (t === "Secondary") return f.showSecondary;
  return false;
}

function getBbox(v: Viewer) {
  const r = v.camera.computeViewRectangle();
  if (!r) return null;
  return {
    south: CesiumMath.toDegrees(r.south),
    west: CesiumMath.toDegrees(r.west),
    north: CesiumMath.toDegrees(r.north),
    east: CesiumMath.toDegrees(r.east),
  };
}

function bboxKey(b: {
  south: number;
  west: number;
  north: number;
  east: number;
}): string {
  return `${b.south.toFixed(2)},${b.west.toFixed(2)},${b.north.toFixed(2)},${b.east.toFixed(2)}`;
}

export function TrafficLayer({
  filter,
  roads: propRoads,
}: TrafficLayerProps): null {
  const { viewer } = useCesium();
  const roadsDsRef = useRef<CustomDataSource | null>(null);
  const particleDsRef = useRef<CustomDataSource | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const animRef = useRef(0);
  const filterRef = useRef(filter);
  const loadedRef = useRef<Road[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastBboxKeyRef = useRef("");
  const visibleRef = useRef(true);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    if (!viewer) return;

    const rds = new CustomDataSource("traffic-roads");
    const pds = new CustomDataSource("traffic-particles");
    viewer.dataSources.add(rds);
    viewer.dataSources.add(pds);
    roadsDsRef.current = rds;
    particleDsRef.current = pds;

    const engine = new ParticleEngine(pds);
    engineRef.current = engine;

    let prev = performance.now();
    const animate = (now: number): void => {
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      if (visibleRef.current) engine.tick(dt);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    const setAllVisible = (show: boolean): void => {
      const vals = rds.entities.values;
      for (let i = 0; i < vals.length; i++) vals[i].show = show;
      const pvals = pds.entities.values;
      for (let i = 0; i < pvals.length; i++) pvals[i].show = show;
      visibleRef.current = show;
    };

    const onCamera = (): void => {
      if (viewer.isDestroyed()) return;

      const alt = viewer.camera.positionCartographic.height;

      if (alt > MAX_ALT) {
        if (visibleRef.current) setAllVisible(false);
        return;
      }

      if (!visibleRef.current) setAllVisible(true);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (viewer.isDestroyed()) return;

        const bbox = getBbox(viewer);
        if (!bbox) return;

        const key = bboxKey(bbox);
        if (key === lastBboxKeyRef.current) return;
        lastBboxKeyRef.current = key;

        const roads = await fetchRoads(bbox);
        loadedRef.current = roads;
        rebuildRoads(roads, filterRef.current, rds, engine);
      }, DEBOUNCE_MS);
    };

    viewer.camera.percentageChanged = 0.05;
    viewer.camera.changed.addEventListener(onCamera);
    onCamera();

    return (): void => {
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      viewer.camera.changed.removeEventListener(onCamera);
      engine.clear();
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(rds, true);
        viewer.dataSources.remove(pds, true);
      }
      roadsDsRef.current = null;
      particleDsRef.current = null;
      engineRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const rds = roadsDsRef.current;
    const engine = engineRef.current;
    if (!rds || !engine) return;

    const roads = propRoads.length > 0 ? propRoads : loadedRef.current;
    rebuildRoads(roads, filter, rds, engine);
  }, [filter, propRoads]);

  return null;
}

function rebuildRoads(
  roads: Road[],
  filter: TrafficFilter,
  ds: CustomDataSource,
  engine: ParticleEngine,
): void {
  ds.entities.removeAll();
  engine.clear();

  if (!filter.enabled) return;

  const visible = roads.filter((r) => typeVisible(filter, r.road_type));

  for (const road of visible) {
    if (road.nodes.length < 2) continue;
    ds.entities.add({
      id: `road_${road.id}`,
      polyline: {
        positions: Cartesian3.fromDegreesArray(
          road.nodes.flatMap((n) => [n.lon, n.lat]),
        ),
        width: ROAD_WIDTH[road.road_type] ?? 1,
        material: ROAD_COLOR[road.road_type] ?? Color.GRAY,
        clampToGround: true,
      },
    });
  }

  engine.updateRoads(visible, new Date().getHours());
}
