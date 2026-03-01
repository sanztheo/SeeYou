import { useEffect } from "react";
import {
  CustomDataSource,
  Color,
  Cartesian3,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  Math as CesiumMath,
  JulianDate,
  type Viewer,
} from "cesium";
import type { AircraftPosition, AircraftFilter } from "../../types/aircraft";
import {
  CIVILIAN_COLOR,
  MILITARY_COLOR,
  LABEL_FONT,
  CIVIL_ICON,
  MIL_ICON,
  makePositionProperty,
  cullEntities,
} from "./aircraftUtils";

export function useAircraftBillboards(
  dataSourceRef: { current: CustomDataSource | null },
  aircraft: Map<string, AircraftPosition>,
  filter: AircraftFilter,
  viewerRef: { current: Viewer | null },
  trackedIcaoRef: { current: string | null },
): void {
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;

    const now = JulianDate.now();

    const visible: AircraftPosition[] = [];
    for (const ac of aircraft.values()) {
      if (ac.is_military && !filter.showMilitary) continue;
      if (!ac.is_military && !filter.showCivilian) continue;
      visible.push(ac);
    }
    const visibleIcaos = new Set(visible.map((ac) => ac.icao));

    const toRemove: string[] = [];
    for (const entity of ds.entities.values) {
      if (entity.id && !visibleIcaos.has(entity.id)) {
        toRemove.push(entity.id);
      }
    }
    if (toRemove.length > 0) {
      ds.entities.suspendEvents();
      for (const id of toRemove) {
        const entity = ds.entities.getById(id);
        if (entity) ds.entities.remove(entity);
      }
      ds.entities.resumeEvents();
      console.log(`[AircraftLayer] removed ${toRemove.length} stale entities`);
    }

    const CHUNK_SIZE = 500;
    let cursor = 0;
    let rafId = 0;
    let cancelled = false;

    const processChunk = (): void => {
      if (cancelled) return;
      const end = Math.min(cursor + CHUNK_SIZE, visible.length);

      ds.entities.suspendEvents();
      for (let i = cursor; i < end; i++) {
        const ac = visible[i];
        const color = ac.is_military ? MILITARY_COLOR : CIVILIAN_COLOR;
        const icon = ac.is_military ? MIL_ICON : CIVIL_ICON;
        const label = ac.callsign ?? ac.icao;
        const rotation = -CesiumMath.toRadians(ac.heading);

        const posProp = makePositionProperty(ac, now);

        const entity = ds.entities.getById(ac.icao);
        if (entity) {
          entity.position = posProp as never;
          if (entity.billboard) {
            entity.billboard.image = icon as never;
            entity.billboard.color = color as never;
            entity.billboard.rotation = rotation as never;
          }
          if (entity.label) {
            entity.label.text = label as never;
          }
        } else {
          ds.entities.add({
            id: ac.icao,
            position: posProp as never,
            billboard: {
              image: icon,
              width: 24,
              height: 24,
              color,
              rotation,
              alignedAxis: Cartesian3.UNIT_Z,
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
              scaleByDistance: new NearFarScalar(5_000, 1.2, 2_000_000, 0.3),
            },
            label: {
              text: label,
              font: LABEL_FONT,
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: 2, // FILL_AND_OUTLINE
              verticalOrigin: VerticalOrigin.TOP,
              horizontalOrigin: HorizontalOrigin.LEFT,
              pixelOffset: { x: 14, y: 4 } as never,
              scaleByDistance: new NearFarScalar(1_000, 1.0, 500_000, 0.0),
            },
          });
        }
      }
      ds.entities.resumeEvents();

      console.log(
        `[AircraftLayer] rendered chunk ${Math.ceil(end / CHUNK_SIZE)}/${Math.ceil(visible.length / CHUNK_SIZE)} (${end}/${visible.length} entities)`,
      );

      cursor = end;
      if (cursor < visible.length) {
        rafId = requestAnimationFrame(processChunk);
      } else {
        console.log(
          `[AircraftLayer] render complete — ${visible.length} entities`,
        );
        const v = viewerRef.current;
        if (v && !v.isDestroyed()) {
          cullEntities(v, ds, trackedIcaoRef.current);
        }
      }
    };

    if (visible.length > 0) {
      rafId = requestAnimationFrame(processChunk);
    }

    return (): void => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable, read lazily via .current
  }, [aircraft, filter]);
}
