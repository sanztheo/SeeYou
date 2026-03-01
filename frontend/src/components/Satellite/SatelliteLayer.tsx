import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  LabelCollection,
  Cartesian3,
  Cartesian2,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  LabelStyle,
  VerticalOrigin,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from "cesium";
import type {
  SatellitePosition,
  SatelliteFilter,
  SatelliteCategory,
} from "../../types/satellite";
import { CATEGORY_FILTER_KEY } from "../../types/satellite";

const CATEGORY_COLORS: Record<SatelliteCategory, Color> = {
  Station: Color.GOLD,
  Starlink: Color.CYAN,
  Military: Color.RED,
  Weather: Color.GREEN,
  Navigation: Color.ROYALBLUE,
  Communication: Color.MEDIUMPURPLE,
  Science: Color.ORANGE,
  Other: Color.GRAY,
};

function makeCategorySvg(category: SatelliteCategory): string {
  const f = "#FFFFFF";
  switch (category) {
    case "Station":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<rect x="8" y="8" width="8" height="8" rx="1" fill="${f}"/>` +
        `<rect x="1" y="10" width="6" height="4" rx="0.5" fill="${f}" opacity="0.8"/>` +
        `<rect x="17" y="10" width="6" height="4" rx="0.5" fill="${f}" opacity="0.8"/>` +
        `<line x1="3" y1="10" x2="6" y2="14" stroke="${f}" stroke-width="0.5" opacity="0.5"/>` +
        `<line x1="5" y1="10" x2="8" y2="14" stroke="${f}" stroke-width="0.5" opacity="0.5"/>` +
        `<line x1="18" y1="10" x2="21" y2="14" stroke="${f}" stroke-width="0.5" opacity="0.5"/>` +
        `<line x1="20" y1="10" x2="23" y2="14" stroke="${f}" stroke-width="0.5" opacity="0.5"/>` +
        `</svg>`
      );
    case "Starlink":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<ellipse cx="12" cy="14" rx="8" ry="3" fill="none" stroke="${f}" stroke-width="1.5"/>` +
        `<ellipse cx="12" cy="14" rx="4" ry="1.5" fill="${f}" opacity="0.6"/>` +
        `<line x1="12" y1="11" x2="12" y2="5" stroke="${f}" stroke-width="1.5"/>` +
        `<circle cx="12" cy="4" r="1.5" fill="${f}"/>` +
        `</svg>`
      );
    case "Military":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<path d="M12 2 L21 9 L18 22 H6 L3 9 Z" fill="none" stroke="${f}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M12 7 L14 12 L12 17 L10 12 Z" fill="${f}" opacity="0.7"/>` +
        `</svg>`
      );
    case "Weather":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<path d="M6 16 a5 5 0 0 1 5-5 h1 a4 4 0 0 1 4 4 v0.5 a3 3 0 0 1-3 3 H8 a3 3 0 0 1-2-2.5z" fill="${f}"/>` +
        `<ellipse cx="11" cy="15.5" rx="7.5" ry="3.5" fill="${f}" opacity="0.7"/>` +
        `</svg>`
      );
    case "Navigation":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<circle cx="12" cy="12" r="9" fill="none" stroke="${f}" stroke-width="1.5"/>` +
        `<circle cx="12" cy="12" r="4" fill="none" stroke="${f}" stroke-width="1.5"/>` +
        `<line x1="12" y1="1" x2="12" y2="6" stroke="${f}" stroke-width="1.5"/>` +
        `<line x1="12" y1="18" x2="12" y2="23" stroke="${f}" stroke-width="1.5"/>` +
        `<line x1="1" y1="12" x2="6" y2="12" stroke="${f}" stroke-width="1.5"/>` +
        `<line x1="18" y1="12" x2="23" y2="12" stroke="${f}" stroke-width="1.5"/>` +
        `</svg>`
      );
    case "Communication":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<line x1="12" y1="22" x2="12" y2="10" stroke="${f}" stroke-width="2"/>` +
        `<circle cx="12" cy="9" r="2" fill="${f}"/>` +
        `<path d="M7 6 a7 7 0 0 1 10 0" fill="none" stroke="${f}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<path d="M4 3.5 a11 11 0 0 1 16 0" fill="none" stroke="${f}" stroke-width="1.5" stroke-linecap="round"/>` +
        `</svg>`
      );
    case "Science":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<circle cx="12" cy="6" r="3" fill="none" stroke="${f}" stroke-width="1.5"/>` +
        `<circle cx="12" cy="6" r="1" fill="${f}"/>` +
        `<line x1="12" y1="9" x2="12" y2="16" stroke="${f}" stroke-width="2"/>` +
        `<line x1="8" y1="16" x2="16" y2="16" stroke="${f}" stroke-width="1.5"/>` +
        `<line x1="7" y1="21" x2="10" y2="16" stroke="${f}" stroke-width="1.5"/>` +
        `<line x1="17" y1="21" x2="14" y2="16" stroke="${f}" stroke-width="1.5"/>` +
        `</svg>`
      );
    case "Other":
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<rect x="7" y="7" width="10" height="10" rx="2" transform="rotate(45 12 12)" fill="${f}"/>` +
        `</svg>`
      );
  }
}

const satelliteIconCache = new Map<SatelliteCategory, string>();

function getCategoryIcon(category: SatelliteCategory): string {
  const cached = satelliteIconCache.get(category);
  if (cached) return cached;
  const svg = makeCategorySvg(category);
  const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
  satelliteIconCache.set(category, uri);
  return uri;
}

const SAT_BB_SCALE = new NearFarScalar(1e6, 1.2, 1e8, 0.4);
const SAT_LBL_SCALE = new NearFarScalar(5e5, 1, 5e7, 0);
const SAT_LBL_DIST = new DistanceDisplayCondition(0, 1e7);
const SAT_LBL_OFFSET = new Cartesian2(0, -14);

interface SatelliteEntry {
  billboard: ReturnType<BillboardCollection["add"]>;
  label: ReturnType<LabelCollection["add"]>;
}

interface SatelliteLayerProps {
  satellites: Map<number, SatellitePosition>;
  filter: SatelliteFilter;
  onSelect?: (satellite: SatellitePosition) => void;
  onHover?: (
    satellite: SatellitePosition | null,
    screenX: number,
    screenY: number,
  ) => void;
}

export function SatelliteLayer({
  satellites,
  filter,
  onSelect,
  onHover,
}: SatelliteLayerProps): null {
  const { viewer } = useCesium();
  const bbCollRef = useRef<BillboardCollection | null>(null);
  const lblCollRef = useRef<LabelCollection | null>(null);
  const entryMapRef = useRef(new Map<string, SatelliteEntry>());
  const satMapRef = useRef(new Map<string, SatellitePosition>());
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    if (!viewer) return;

    const bbColl = viewer.scene.primitives.add(
      new BillboardCollection({ scene: viewer.scene }),
    ) as BillboardCollection;
    const lblColl = viewer.scene.primitives.add(
      new LabelCollection({ scene: viewer.scene }),
    ) as LabelCollection;
    bbCollRef.current = bbColl;
    lblCollRef.current = lblColl;

    const handler = new ScreenSpaceEventHandler(
      viewer.scene.canvas as HTMLCanvasElement,
    );

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && typeof picked.id === "string") {
        const sat = satMapRef.current.get(picked.id);
        if (sat) onSelectRef.current?.(sat);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(move.endPosition);
      if (defined(picked) && typeof picked.id === "string") {
        const sat = satMapRef.current.get(picked.id);
        if (sat) {
          onHoverRef.current?.(sat, move.endPosition.x, move.endPosition.y);
          return;
        }
      }
      onHoverRef.current?.(null, 0, 0);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return (): void => {
      handler.destroy();
      entryMapRef.current.clear();
      satMapRef.current.clear();
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(bbColl);
        viewer.scene.primitives.remove(lblColl);
      }
      bbCollRef.current = null;
      lblCollRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const bbColl = bbCollRef.current;
    const lblColl = lblCollRef.current;
    if (!bbColl || !lblColl || !viewer) return;

    const entries = entryMapRef.current;
    const nextSatMap = new Map<string, SatellitePosition>();
    const activeIds = new Set<string>();

    for (const [noradId, sat] of satellites) {
      if (!filter[CATEGORY_FILTER_KEY[sat.category]]) continue;

      const id = String(noradId);
      activeIds.add(id);
      nextSatMap.set(id, sat);

      const color = CATEGORY_COLORS[sat.category] ?? Color.GRAY;
      const pos = Cartesian3.fromDegrees(
        sat.lon,
        sat.lat,
        sat.altitude_km * 1000,
      );
      const icon = getCategoryIcon(sat.category);

      const existing = entries.get(id);
      if (existing) {
        existing.billboard.position = pos;
        existing.billboard.color = color;
        existing.billboard.image = icon;
        existing.label.position = pos;
        existing.label.text = sat.name;
      } else {
        const billboard = bbColl.add({
          position: pos,
          image: icon,
          width: 20,
          height: 20,
          color,
          scaleByDistance: SAT_BB_SCALE,
          id,
        });
        const label = lblColl.add({
          position: pos,
          text: sat.name,
          font: "11px monospace",
          fillColor: Color.WHITE.withAlpha(0.9),
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: SAT_LBL_OFFSET,
          scaleByDistance: SAT_LBL_SCALE,
          distanceDisplayCondition: SAT_LBL_DIST,
          id,
        });
        entries.set(id, { billboard, label });
      }
    }

    const toDelete: string[] = [];
    for (const id of entries.keys()) {
      if (!activeIds.has(id)) toDelete.push(id);
    }
    for (const id of toDelete) {
      const entry = entries.get(id)!;
      bbColl.remove(entry.billboard);
      lblColl.remove(entry.label);
      entries.delete(id);
    }

    satMapRef.current = nextSatMap;
  }, [satellites, filter, viewer]);

  return null;
}
