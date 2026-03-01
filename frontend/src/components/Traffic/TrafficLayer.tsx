import { useEffect, useRef, useMemo } from "react";
import { useCesium } from "resium";
import { CustomDataSource, Cartesian3, Color } from "cesium";
import type { Road, TrafficFilter, RoadType } from "../../types/traffic";
import { ParticleEngine } from "./ParticleEngine";
import { useTrafficLoader } from "./useTrafficLoader";
import { typeVisible } from "./trafficUtils";
import { ROAD_COLOR, ROAD_WIDTH, MAX_ALT } from "./trafficConstants";

interface TrafficLayerProps {
  filter: TrafficFilter;
  onLoadingChange?: (loading: boolean, count: number) => void;
}

export function TrafficLayer({
  filter,
  onLoadingChange,
}: TrafficLayerProps): null {
  const { viewer } = useCesium();
  const { roads, loading, roadCount, aboveMaxAlt } = useTrafficLoader(
    viewer,
    filter,
  );

  const roadsDsRef = useRef<CustomDataSource | null>(null);
  const particleDsRef = useRef<CustomDataSource | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const animRef = useRef(0);
  const renderedKeyRef = useRef("");

  useEffect(() => {
    onLoadingChange?.(loading, roadCount);
  }, [loading, roadCount, onLoadingChange]);

  const filteredRoads = useMemo(
    () =>
      filter.enabled
        ? roads.filter((r) => typeVisible(filter, r.road_type))
        : [],
    [roads, filter],
  );

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

    return (): void => {
      cancelAnimationFrame(animRef.current);
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

    if (aboveMaxAlt || !filter.enabled) {
      setAllShow(rds, false);
      setAllShow(particleDsRef.current, false);
      return;
    }

    const key = filteredRoads.map((r) => r.id).join(",");
    if (key === renderedKeyRef.current) {
      setAllShow(rds, true);
      setAllShow(particleDsRef.current, true);
      return;
    }
    renderedKeyRef.current = key;

    renderRoads(filteredRoads, rds, engine);
  }, [filteredRoads, filter.enabled, aboveMaxAlt]);

  return null;
}

function setAllShow(ds: CustomDataSource | null, show: boolean): void {
  if (!ds) return;
  const vals = ds.entities.values;
  for (let i = 0; i < vals.length; i++) vals[i].show = show;
}

function renderRoads(
  roads: Road[],
  ds: CustomDataSource,
  engine: ParticleEngine,
): void {
  ds.entities.removeAll();
  engine.clear();

  for (const road of roads) {
    if (road.nodes.length < 2) continue;
    ds.entities.add({
      id: `road_${road.id}`,
      polyline: {
        positions: Cartesian3.fromDegreesArray(
          road.nodes.flatMap((n) => [n.lon, n.lat]),
        ),
        width: ROAD_WIDTH[road.road_type as RoadType] ?? 1,
        material: ROAD_COLOR[road.road_type as RoadType] ?? Color.GRAY,
        clampToGround: true,
      },
    });
  }

  engine.updateRoads(roads, new Date().getHours());
}
