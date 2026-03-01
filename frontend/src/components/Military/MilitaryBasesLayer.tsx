import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
} from "cesium";
import type { MilitaryBase, MilitaryFilter } from "../../types/military";

interface Props {
  bases: MilitaryBase[];
  filter: MilitaryFilter;
}

const BRANCH_COLORS: Record<string, Color> = {
  air: Color.fromCssColorString("#60A5FA"),
  army: Color.fromCssColorString("#34D399"),
  naval: Color.fromCssColorString("#818CF8"),
  intelligence: Color.fromCssColorString("#F472B6"),
};

function createDiamondCanvas(color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(30, 16);
  ctx.lineTo(16, 30);
  ctx.lineTo(2, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  return canvas;
}

const canvasCache = new Map<string, HTMLCanvasElement>();
function getDiamondCanvas(branch: string): HTMLCanvasElement {
  const color = BRANCH_COLORS[branch] ?? BRANCH_COLORS.army;
  const key = color.toCssColorString();
  if (!canvasCache.has(key)) {
    canvasCache.set(key, createDiamondCanvas(key));
  }
  return canvasCache.get(key)!;
}

export function MilitaryBasesLayer({ bases, filter }: Props): null {
  const { scene } = useCesium();
  const bbRef = useRef<BillboardCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });

    if (filter.enabled) {
      for (const base of bases) {
        if (filter.branches.size > 0 && !filter.branches.has(base.branch))
          continue;
        bbs.add({
          position: Cartesian3.fromDegrees(base.lon, base.lat),
          image: getDiamondCanvas(base.branch),
          width: 16,
          height: 16,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e7),
        });
      }
    }

    scene.primitives.add(bbs);
    bbRef.current = bbs;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, bases, filter.enabled, filter.branches]);

  return null;
}
