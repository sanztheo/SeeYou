import { useEffect } from "react";
import {
  CustomDataSource,
  Color,
  Cartesian3,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  ArcType,
  PolylineDashMaterialProperty,
} from "cesium";
import type {
  AircraftPosition,
  AircraftFilter,
  PredictedTrajectory,
} from "../../types/aircraft";
import {
  PREDICTION_COLOR,
  PATTERN_LABEL_FONT,
  patternLabel,
} from "./aircraftUtils";

export function usePredictions(
  predDsRef: { current: CustomDataSource | null },
  predictions: Map<string, PredictedTrajectory>,
  aircraft: Map<string, AircraftPosition>,
  filter: AircraftFilter,
): void {
  useEffect(() => {
    const predDs = predDsRef.current;
    if (!predDs) return;

    predDs.entities.removeAll();

    if (predictions.size === 0) return;

    predDs.entities.suspendEvents();

    for (const [icao, pred] of predictions) {
      if (pred.points.length < 2) continue;

      const ac = aircraft.get(icao);
      if (!ac || !ac.is_military || !filter.showMilitary) continue;

      const positions = pred.points.map((p) =>
        Cartesian3.fromDegrees(p.lon, p.lat, p.alt_m),
      );

      const acPos = Cartesian3.fromDegrees(ac.lon, ac.lat, ac.altitude_m);
      positions.unshift(acPos);

      predDs.entities.add({
        id: `pred-path-${icao}`,
        polyline: {
          positions,
          width: 2,
          material: new PolylineDashMaterialProperty({
            color: PREDICTION_COLOR,
            dashLength: 12,
          }),
          arcType: ArcType.GEODESIC,
          clampToGround: false,
        },
      });

      for (let i = 0; i < pred.points.length; i += 4) {
        const p = pred.points[i];
        if (p.sigma_xy_m < 500) continue;

        const corridorCenter = Cartesian3.fromDegrees(p.lon, p.lat, p.alt_m);
        const alpha = Math.max(0.03, 0.15 - (i / pred.points.length) * 0.12);

        predDs.entities.add({
          id: `pred-unc-${icao}-${i}`,
          position: corridorCenter,
          ellipse: {
            semiMajorAxis: p.sigma_xy_m,
            semiMinorAxis: p.sigma_xy_m,
            height: p.alt_m,
            material: PREDICTION_COLOR.withAlpha(alpha),
            outline: false,
          } as never,
        });
      }

      const label = patternLabel(pred.pattern);
      if (label) {
        predDs.entities.add({
          id: `pred-label-${icao}`,
          position: acPos,
          label: {
            text: label,
            font: PATTERN_LABEL_FONT,
            fillColor: PREDICTION_COLOR,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: 2,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: { x: 0, y: -18 } as never,
            scaleByDistance: new NearFarScalar(5_000, 1.0, 500_000, 0.0),
          },
        });
      }
    }

    predDs.entities.resumeEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is stable, read lazily via .current
  }, [predictions, aircraft, filter]);
}
