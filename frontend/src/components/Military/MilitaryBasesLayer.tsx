import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type { MilitaryBase, MilitaryFilter } from "../../types/military";

interface Props {
  bases: MilitaryBase[];
  filter: MilitaryFilter;
  onSelect?: (base: MilitaryBase) => void;
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

function baseKey(b: MilitaryBase): string {
  return `${b.name}::${b.country}`;
}

const MIL_SCALE = new NearFarScalar(1e5, 1.5, 1e7, 0.4);
const MIL_DDC = new DistanceDisplayCondition(0, 3e7);

export function MilitaryBasesLayer({ bases, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, MilitaryBase>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const handler = new ScreenSpaceEventHandler(
      scene.canvas as HTMLCanvasElement,
    );
    handler.setInputAction((click: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = scene.pick(click.position);
      if (defined(picked) && typeof picked.id === "string") {
        const base = dataMapRef.current.get(picked.id);
        if (base) onSelectRef.current?.(base);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });
    const map = new Map<string, MilitaryBase>();

    if (filter.enabled) {
      for (const b of bases) {
        if (filter.branches.size > 0 && !filter.branches.has(b.branch))
          continue;
        const key = baseKey(b);
        map.set(key, b);
        bbs.add({
          position: Cartesian3.fromDegrees(b.lon, b.lat),
          image: getDiamondCanvas(b.branch),
          width: 16,
          height: 16,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: MIL_SCALE,
          distanceDisplayCondition: MIL_DDC,
          id: key,
        });
      }
    }

    scene.primitives.add(bbs);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, bases, filter.enabled, filter.branches]);

  return null;
}
