import {
  CustomDataSource,
  Cartesian3,
  Color,
  NearFarScalar,
  ConstantPositionProperty,
} from "cesium";
import type { Road, RoadType } from "../../types/traffic";

interface Particle {
  id: string;
  progress: number;
  speed: number;
  total: number;
  segments: number[];
  nodes: { lat: number; lon: number }[];
}

const BASE_SPEED: Record<RoadType, number> = {
  Motorway: 33,
  Trunk: 25,
  Primary: 14,
  Secondary: 8,
  Tertiary: 6,
};

const SPACING: Record<RoadType, number> = {
  Motorway: 400,
  Trunk: 600,
  Primary: 1000,
  Secondary: 1500,
  Tertiary: 2000,
};

const MAX_PARTICLES = 2000;

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function densityFactor(hour: number): number {
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return 1.5;
  if (hour >= 22 || hour < 6) return 0.4;
  return 1.0;
}

function speedFactor(hour: number): number {
  if (hour >= 7 && hour < 9) return 0.4;
  if (hour >= 17 && hour < 19) return 0.5;
  if (hour >= 22 || hour < 6) return 1.2;
  return 1.0;
}

function flowColor(ratio: number): Color {
  if (ratio > 0.7) return Color.fromCssColorString("#4CAF50");
  if (ratio > 0.4) return Color.fromCssColorString("#FFC107");
  return Color.fromCssColorString("#F44336");
}

function lerp(
  nodes: { lat: number; lon: number }[],
  segs: number[],
  progress: number,
): { lat: number; lon: number } {
  let rem = progress;
  for (let i = 0; i < segs.length; i++) {
    if (rem <= segs[i]) {
      const t = segs[i] > 0 ? rem / segs[i] : 0;
      return {
        lat: nodes[i].lat + (nodes[i + 1].lat - nodes[i].lat) * t,
        lon: nodes[i].lon + (nodes[i + 1].lon - nodes[i].lon) * t,
      };
    }
    rem -= segs[i];
  }
  return nodes[nodes.length - 1];
}

export class ParticleEngine {
  private ds: CustomDataSource;
  private particles: Particle[] = [];
  private scratch = new Cartesian3();

  constructor(dataSource: CustomDataSource) {
    this.ds = dataSource;
  }

  updateRoads(roads: Road[], hour: number): void {
    this.clear();
    const df = densityFactor(hour);
    const sf = speedFactor(hour);
    const color = flowColor(sf);
    let count = 0;

    for (let ri = 0; ri < roads.length; ri++) {
      const road = roads[ri];
      if (road.nodes.length < 2) continue;

      const segs: number[] = [];
      let total = 0;
      for (let i = 1; i < road.nodes.length; i++) {
        const d = haversine(
          road.nodes[i - 1].lat,
          road.nodes[i - 1].lon,
          road.nodes[i].lat,
          road.nodes[i].lon,
        );
        segs.push(d);
        total += d;
      }
      if (total < 50) continue;

      const spacing = SPACING[road.road_type] ?? 1500;
      const n = Math.max(1, Math.round((total / spacing) * df));
      const base = (BASE_SPEED[road.road_type] ?? 10) * sf;

      for (let p = 0; p < n && count < MAX_PARTICLES; p++) {
        const id = `tp_${ri}_${p}`;
        const progress = (total / n) * p;
        const pos = lerp(road.nodes, segs, progress);

        this.ds.entities.add({
          id,
          position: Cartesian3.fromDegrees(pos.lon, pos.lat),
          point: {
            pixelSize: 3,
            color,
            scaleByDistance: new NearFarScalar(1_000, 1.2, 50_000, 0.3),
          },
        });

        this.particles.push({
          id,
          progress,
          speed: base * (0.8 + Math.random() * 0.4),
          total,
          segments: segs,
          nodes: road.nodes,
        });
        count++;
      }
    }
  }

  tick(dt: number): void {
    for (const p of this.particles) {
      p.progress += p.speed * dt;
      if (p.progress >= p.total) p.progress -= p.total;

      const pos = lerp(p.nodes, p.segments, p.progress);
      const ent = this.ds.entities.getById(p.id);
      if (ent) {
        Cartesian3.fromDegrees(pos.lon, pos.lat, 0, undefined, this.scratch);
        (ent.position as unknown as ConstantPositionProperty).setValue(
          this.scratch,
        );
      }
    }
  }

  clear(): void {
    this.ds.entities.removeAll();
    this.particles = [];
  }

  get count(): number {
    return this.particles.length;
  }
}
