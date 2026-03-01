import { useEffect, useRef } from "react";
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
  filterVisibleAircraft,
  computeEntityDiff,
} from "./aircraftUtils";

const ADD_CHUNK_SIZE = 500;

export function useAircraftBillboards(
  dataSourceRef: { current: CustomDataSource | null },
  aircraft: Map<string, AircraftPosition>,
  filter: AircraftFilter,
  viewerRef: { current: Viewer | null },
  trackedIcaoRef: { current: string | null },
): void {
  const rafIdRef = useRef(0);

  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;

    const now = JulianDate.now();

    const visible = filterVisibleAircraft(aircraft, filter);

    const renderedIds = new Set<string>();
    for (const entity of ds.entities.values) {
      if (entity.id) renderedIds.add(entity.id);
    }

    const { toAdd, toUpdate, toRemove } = computeEntityDiff(
      visible,
      renderedIds,
    );

    // Phase 1: Remove departed entities — synchronous, fast
    if (toRemove.length > 0) {
      ds.entities.suspendEvents();
      for (const id of toRemove) {
        const entity = ds.entities.getById(id);
        if (entity) ds.entities.remove(entity);
      }
      ds.entities.resumeEvents();
    }

    // Phase 2: Update existing entities — synchronous, no entity creation
    if (toUpdate.length > 0) {
      ds.entities.suspendEvents();
      for (const ac of toUpdate) {
        const entity = ds.entities.getById(ac.icao);
        if (entity) {
          const color = ac.is_military ? MILITARY_COLOR : CIVILIAN_COLOR;
          const icon = ac.is_military ? MIL_ICON : CIVIL_ICON;
          const rotation = -CesiumMath.toRadians(ac.heading);
          entity.position = makePositionProperty(ac, now) as never;
          if (entity.billboard) {
            entity.billboard.image = icon as never;
            entity.billboard.color = color as never;
            entity.billboard.rotation = rotation as never;
          }
          if (entity.label) {
            entity.label.text = (ac.callsign ?? ac.icao) as never;
          }
        }
      }
      ds.entities.resumeEvents();
    }

    // Phase 3: Add genuinely new entities — chunked via rAF (entity creation is expensive)
    cancelAnimationFrame(rafIdRef.current);
    let cursor = 0;
    let cancelled = false;

    const processAdditions = (): void => {
      if (cancelled) return;
      const end = Math.min(cursor + ADD_CHUNK_SIZE, toAdd.length);

      ds.entities.suspendEvents();
      for (let i = cursor; i < end; i++) {
        const ac = toAdd[i];
        const color = ac.is_military ? MILITARY_COLOR : CIVILIAN_COLOR;
        const icon = ac.is_military ? MIL_ICON : CIVIL_ICON;
        ds.entities.add({
          id: ac.icao,
          position: makePositionProperty(ac, now) as never,
          billboard: {
            image: icon,
            width: 24,
            height: 24,
            color,
            rotation: -CesiumMath.toRadians(ac.heading),
            alignedAxis: Cartesian3.UNIT_Z,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            scaleByDistance: new NearFarScalar(5_000, 1.2, 2_000_000, 0.3),
          },
          label: {
            text: ac.callsign ?? ac.icao,
            font: LABEL_FONT,
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: 2,
            verticalOrigin: VerticalOrigin.TOP,
            horizontalOrigin: HorizontalOrigin.LEFT,
            pixelOffset: { x: 14, y: 4 } as never,
            scaleByDistance: new NearFarScalar(1_000, 1.0, 500_000, 0.0),
          },
        });
      }
      ds.entities.resumeEvents();

      cursor = end;
      if (cursor < toAdd.length) {
        rafIdRef.current = requestAnimationFrame(processAdditions);
      } else {
        const v = viewerRef.current;
        if (v && !v.isDestroyed()) {
          cullEntities(v, ds, trackedIcaoRef.current);
        }
      }
    };

    if (toAdd.length > 0) {
      rafIdRef.current = requestAnimationFrame(processAdditions);
    } else {
      const v = viewerRef.current;
      if (v && !v.isDestroyed()) {
        cullEntities(v, ds, trackedIcaoRef.current);
      }
    }

    return (): void => {
      cancelled = true;
      cancelAnimationFrame(rafIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, filter]);
}
