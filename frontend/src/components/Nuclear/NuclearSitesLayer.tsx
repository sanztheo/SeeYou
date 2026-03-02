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
import type { NuclearSite, NuclearFilter } from "../../types/nuclear";

interface Props {
  sites: NuclearSite[];
  filter: NuclearFilter;
  onSelect?: (site: NuclearSite) => void;
}

const TYPE_COLORS: Record<string, Color> = {
  power: Color.fromCssColorString("#FBBF24"),
  weapons: Color.RED,
  enrichment: Color.fromCssColorString("#F97316"),
  reprocessing: Color.fromCssColorString("#A855F7"),
};

function createRadiationCanvas(color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const s = 32;
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const r = s / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.arc(r, r, 5, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

const canvasCache = new Map<string, HTMLCanvasElement>();
function getNuclearCanvas(type: string): HTMLCanvasElement {
  const color = (TYPE_COLORS[type] ?? Color.YELLOW).toCssColorString();
  if (!canvasCache.has(color)) {
    canvasCache.set(color, createRadiationCanvas(color));
  }
  return canvasCache.get(color)!;
}

function siteKey(s: NuclearSite): string {
  return `${s.name}::${s.country}`;
}

const NUC_SCALE = new NearFarScalar(1e5, 1.5, 1e7, 0.4);
const NUC_DDC = new DistanceDisplayCondition(0, 3e7);

export function NuclearSitesLayer({ sites, filter, onSelect }: Props): null {
  const { scene } = useCesium();
  const dataMapRef = useRef(new Map<string, NuclearSite>());
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
        const site = dataMapRef.current.get(picked.id);
        if (site) onSelectRef.current?.(site);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const bbs = new BillboardCollection({ scene });
    const map = new Map<string, NuclearSite>();

    if (filter.enabled) {
      for (const site of sites) {
        if (filter.types.size > 0 && !filter.types.has(site.type)) continue;
        const key = siteKey(site);
        map.set(key, site);
        bbs.add({
          position: Cartesian3.fromDegrees(site.lon, site.lat),
          image: getNuclearCanvas(site.type),
          width: 18,
          height: 18,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: NUC_SCALE,
          distanceDisplayCondition: NUC_DDC,
          id: key,
        });
      }
    }

    scene.primitives.add(bbs);
    dataMapRef.current = map;

    return () => {
      if (!scene.isDestroyed()) scene.primitives.remove(bbs);
    };
  }, [scene, sites, filter.enabled, filter.types]);

  return null;
}
