import { Math as CesiumMath, type Viewer } from "cesium";
import type { BoundingBox } from "../../types/traffic";

export function getViewerBbox(v: Viewer): BoundingBox | null {
  const r = v.camera.computeViewRectangle();
  if (!r) return null;
  return {
    south: CesiumMath.toDegrees(r.south),
    west: CesiumMath.toDegrees(r.west),
    north: CesiumMath.toDegrees(r.north),
    east: CesiumMath.toDegrees(r.east),
  };
}

export function bboxKey(b: BoundingBox): string {
  return `${b.south.toFixed(2)},${b.west.toFixed(2)},${b.north.toFixed(2)},${b.east.toFixed(2)}`;
}

export function bboxContains(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    outer.south <= inner.south + 0.01 &&
    outer.west <= inner.west + 0.01 &&
    outer.north >= inner.north - 0.01 &&
    outer.east >= inner.east - 0.01
  );
}
