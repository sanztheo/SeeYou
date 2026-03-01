import { useEffect, useRef, useMemo } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  PointPrimitiveCollection,
  Cartesian3,
  Color,
} from "cesium";
import type { Road, TrafficFilter, RoadType } from "../../types/traffic";
import { ParticleEngine } from "./ParticleEngine";
import { useTrafficLoader } from "./useTrafficLoader";
import { typeVisible } from "./trafficUtils";
import { ROAD_COLOR, ROAD_WIDTH } from "./trafficConstants";

interface TrafficLayerProps {
  filter: TrafficFilter;
  onLoadingChange?: (loading: boolean, count: number, total: number) => void;
}

export function TrafficLayer({
  filter,
  onLoadingChange,
}: TrafficLayerProps): null {
  const { viewer } = useCesium();
  const { roads, loading, roadCount, aboveMaxAlt, progress } = useTrafficLoader(
    viewer,
    filter,
  );

  const roadsDsRef = useRef<CustomDataSource | null>(null);
  const pointCollRef = useRef<PointPrimitiveCollection | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const animRef = useRef(0);
  const renderedKeyRef = useRef("");
  const pausedRef = useRef(false);

  useEffect(() => {
    onLoadingChange?.(loading, roadCount, progress.total);
  }, [loading, roadCount, progress.total, onLoadingChange]);

  const filteredRoads = useMemo(
    () =>
      filter.enabled
        ? roads.filter((r) => typeVisible(filter, r.road_type))
        : [],
    [
      roads,
      filter.enabled,
      filter.showMotorway,
      filter.showTrunk,
      filter.showPrimary,
      filter.showSecondary,
    ],
  );

  useEffect(() => {
    if (!viewer) return;

    const rds = new CustomDataSource("traffic-roads");
    viewer.dataSources.add(rds);
    roadsDsRef.current = rds;

    const pointColl = viewer.scene.primitives.add(
      new PointPrimitiveCollection(),
    ) as PointPrimitiveCollection;
    pointCollRef.current = pointColl;

    const engine = new ParticleEngine(pointColl);
    engineRef.current = engine;

    let prev = performance.now();
    const animate = (now: number): void => {
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      if (!pausedRef.current) engine.tick(dt);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return (): void => {
      cancelAnimationFrame(animRef.current);
      engine.clear();
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(rds, true);
        viewer.scene.primitives.remove(pointColl);
      }
      roadsDsRef.current = null;
      pointCollRef.current = null;
      engineRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const rds = roadsDsRef.current;
    const engine = engineRef.current;
    const pointColl = pointCollRef.current;
    if (!rds || !engine || !pointColl) return;

    if (aboveMaxAlt || !filter.enabled) {
      pausedRef.current = true;
      rds.show = false;
      pointColl.show = false;
      return;
    }
    pausedRef.current = false;
    rds.show = true;
    pointColl.show = true;

    const key =
      filteredRoads.length +
      "_" +
      (filteredRoads[0]?.id ?? "") +
      "_" +
      (filteredRoads[filteredRoads.length - 1]?.id ?? "");
    if (key === renderedKeyRef.current) return;
    renderedKeyRef.current = key;

    renderRoads(filteredRoads, rds, engine);
  }, [filteredRoads, filter.enabled, aboveMaxAlt]);

  return null;
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
