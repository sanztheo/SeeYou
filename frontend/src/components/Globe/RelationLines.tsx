import { useEffect } from "react";
import { useCesium } from "resium";
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  CustomDataSource,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Entity,
} from "cesium";
import type { GraphEdge, GraphNode, GraphRef, GraphSnapshot } from "../../types/graph";

interface RelationLinesProps {
  snapshot?: GraphSnapshot | null;
  focus?: GraphRef | null;
  maxLines?: number;
}

interface GeoPoint {
  lat: number;
  lon: number;
}

interface RelationSegment {
  id: string;
  relation: string;
  from: GeoPoint;
  to: GeoPoint;
}

function keyOf(ref: GraphRef): string {
  return `${ref.table}:${ref.id}`;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCentroid(value: unknown): GeoPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = asNumber(value[0]);
  const second = asNumber(value[1]);
  if (first === null || second === null) return null;

  // Prefer GeoJSON order [lon, lat] when plausible.
  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { lon: first, lat: second };
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { lat: first, lon: second };
  }

  return null;
}

function nodePoint(node: GraphNode): GeoPoint | null {
  const lat = asNumber(node.lat) ?? asNumber(node.entity?.lat);
  const lon = asNumber(node.lon) ?? asNumber(node.entity?.lon);
  if (lat !== null && lon !== null) {
    return { lat, lon };
  }

  return parseCentroid(node.entity?.centroid);
}

function edgeId(edge: GraphEdge): string {
  return `${edge.ref.table}:${edge.ref.id}`;
}

function midpoint(from: GeoPoint, to: GeoPoint): GeoPoint {
  return {
    lat: (from.lat + to.lat) / 2,
    lon: (from.lon + to.lon) / 2,
  };
}

function pickEntityId(picked: { id?: unknown } | undefined): string | null {
  if (!picked) return null;
  if (typeof picked.id === "string") return picked.id;
  const entity = picked.id as { id?: unknown } | undefined;
  return entity && typeof entity.id === "string" ? entity.id : null;
}

export function buildRelationLineSegments(
  snapshot: GraphSnapshot | null | undefined,
  focus: GraphRef | null | undefined,
  maxLines = 24,
): RelationSegment[] {
  if (!snapshot || !focus || maxLines <= 0) {
    return [];
  }

  const focusKey = keyOf(focus);
  const nodes = new Map(snapshot.nodes.map((node) => [keyOf(node.ref), node]));
  const dedup = new Set<string>();
  const segments: RelationSegment[] = [];

  for (const edge of snapshot.edges) {
    const fromKey = keyOf(edge.from);
    const toKey = keyOf(edge.to);
    if (fromKey !== focusKey && toKey !== focusKey) {
      continue;
    }

    const fromNode = nodes.get(fromKey);
    const toNode = nodes.get(toKey);
    if (!fromNode || !toNode) {
      continue;
    }

    const fromPoint = nodePoint(fromNode);
    const toPoint = nodePoint(toNode);
    if (!fromPoint || !toPoint) {
      continue;
    }

    const id = edgeId(edge);
    if (dedup.has(id)) {
      continue;
    }

    dedup.add(id);
    segments.push({
      id,
      relation: edge.relation,
      from: fromPoint,
      to: toPoint,
    });

    if (segments.length >= maxLines) {
      break;
    }
  }

  return segments;
}

export function buildRelationLineEntityOptions(
  segments: RelationSegment[],
): Array<Record<string, unknown>> {
  return segments.map((segment) => {
    const center = midpoint(segment.from, segment.to);

    return {
      id: segment.id,
      position: Cartesian3.fromDegrees(center.lon, center.lat, 140),
      polyline: {
        positions: [
          Cartesian3.fromDegrees(segment.from.lon, segment.from.lat, 120),
          Cartesian3.fromDegrees(segment.to.lon, segment.to.lat, 120),
        ],
        width: 2,
        material: Color.CYAN.withAlpha(0.78),
        arcType: ArcType.GEODESIC,
        clampToGround: false,
      },
      label: {
        text: segment.relation,
        show: false,
        font: "bold 11px monospace",
        fillColor: Color.CYAN,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 2,
        pixelOffset: new Cartesian2(0, -8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    };
  });
}

export function setHoveredRelationLine(
  entities: Iterable<Entity>,
  hoveredId: string | null,
): void {
  for (const entity of entities) {
    if (!entity.label) continue;
    entity.label.show = new ConstantProperty(entity.id === hoveredId);
  }
}

export function RelationLines({
  snapshot,
  focus,
  maxLines = 24,
}: RelationLinesProps): null {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) {
      return;
    }

    const segments = buildRelationLineSegments(snapshot, focus, maxLines);
    if (segments.length === 0) {
      return;
    }

    const ds = new CustomDataSource("relation-lines");
    for (const options of buildRelationLineEntityOptions(segments)) {
      ds.entities.add(options);
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas as HTMLCanvasElement);
    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(move.endPosition);
      const hoveredId = pickEntityId(defined(picked) ? picked : undefined);
      setHoveredRelationLine(ds.entities.values, hoveredId);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    viewer.dataSources.add(ds);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) {
        void viewer.dataSources.remove(ds, true);
      }
    };
  }, [viewer, snapshot, focus, maxLines]);

  return null;
}
