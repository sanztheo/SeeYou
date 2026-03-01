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
const DEBOUNCE_MS = 300;

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

function drawRoads(
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
      engine.tick(dt);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    const onCamera = (): void => {
      if (viewer.isDestroyed()) return;
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        if (viewer.isDestroyed()) return;

        if (viewer.camera.positionCartographic.height > MAX_ALT) {
          rds.entities.removeAll();
          engine.clear();
          return;
        }

        const bbox = getBbox(viewer);
        if (!bbox) return;

        const roads = await fetchRoads(bbox);
        loadedRef.current = roads;
        drawRoads(roads, filterRef.current, rds, engine);
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
    drawRoads(roads, filter, rds, engine);
  }, [filter, propRoads]);  

  return null;
}
