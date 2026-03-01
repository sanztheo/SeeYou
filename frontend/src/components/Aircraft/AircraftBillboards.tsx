import { useEffect, useRef } from "react";
import {
  BillboardCollection,
  LabelCollection,
  Cartesian3,
  Cartesian2,
  Color,
  NearFarScalar,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  Math as CesiumMath,
} from "cesium";
import type { AircraftPosition, AircraftFilter } from "../../types/aircraft";
import {
  CIVILIAN_COLOR,
  MILITARY_COLOR,
  LABEL_FONT,
  CIVIL_ICON,
  MIL_ICON,
  filterVisibleAircraft,
} from "./aircraftUtils";

const BILLBOARD_SCALE = new NearFarScalar(5_000, 1.2, 2_000_000, 0.3);
const LABEL_SCALE = new NearFarScalar(1_000, 1.0, 500_000, 0.0);
const LABEL_OFFSET = new Cartesian2(14, 4);

interface BillboardEntry {
  billboard: ReturnType<BillboardCollection["add"]>;
  label: ReturnType<LabelCollection["add"]>;
}

export function useAircraftBillboards(
  bbCollRef: { current: BillboardCollection | null },
  lblCollRef: { current: LabelCollection | null },
  aircraft: Map<string, AircraftPosition>,
  filter: AircraftFilter,
): void {
  const entryMapRef = useRef(new Map<string, BillboardEntry>());

  useEffect(() => {
    const bbColl = bbCollRef.current;
    const lblColl = lblCollRef.current;
    if (!bbColl || !lblColl) return;

    const visible = filterVisibleAircraft(aircraft, filter);
    const entries = entryMapRef.current;

    const toDelete: string[] = [];
    for (const icao of entries.keys()) {
      if (!visible.has(icao)) toDelete.push(icao);
    }
    for (const icao of toDelete) {
      const entry = entries.get(icao)!;
      bbColl.remove(entry.billboard);
      lblColl.remove(entry.label);
      entries.delete(icao);
    }

    for (const [icao, ac] of visible) {
      const pos = Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude_m);
      const color = ac.is_military ? MILITARY_COLOR : CIVILIAN_COLOR;
      const icon = ac.is_military ? MIL_ICON : CIVIL_ICON;
      const rotation = -CesiumMath.toRadians(ac.heading);

      const existing = entries.get(icao);
      if (existing) {
        existing.billboard.position = pos;
        existing.billboard.image = icon;
        existing.billboard.color = color;
        existing.billboard.rotation = rotation;
        existing.label.position = pos;
        existing.label.text = ac.callsign ?? ac.icao;
      } else {
        const billboard = bbColl.add({
          position: pos,
          image: icon,
          width: 24,
          height: 24,
          color,
          rotation,
          alignedAxis: Cartesian3.UNIT_Z,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: BILLBOARD_SCALE,
          id: icao,
        });
        const label = lblColl.add({
          position: pos,
          text: ac.callsign ?? ac.icao,
          font: LABEL_FONT,
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.TOP,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: LABEL_OFFSET,
          scaleByDistance: LABEL_SCALE,
          id: icao,
        });
        entries.set(icao, { billboard, label });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, filter]);
}
