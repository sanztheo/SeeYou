import { useEffect } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Cartesian3,
  Cartesian2,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  LabelStyle,
  VerticalOrigin,
} from "cesium";
import { CAPITALS, type Capital } from "../../data/capitals";

function maxDistance(pop: number): number {
  if (pop >= 5_000_000) return 8_000_000;
  if (pop >= 1_000_000) return 3_000_000;
  if (pop >= 300_000) return 1_200_000;
  return 800_000;
}

function fontSize(pop: number): string {
  if (pop >= 5_000_000) return "bold 13px monospace";
  if (pop >= 1_000_000) return "bold 11px monospace";
  return "10px monospace";
}

export function CityLabelsLayer(): null {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer) return;

    const existing = viewer.dataSources.getByName("city-labels");
    if (existing.length > 0) return;

    const ds = new CustomDataSource("city-labels");

    for (const cap of CAPITALS) {
      addCapitalEntity(ds, cap);
    }

    viewer.dataSources.add(ds);

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
      }
    };
  }, [viewer]);

  return null;
}

function addCapitalEntity(ds: CustomDataSource, cap: Capital): void {
  const dist = maxDistance(cap.population);

  ds.entities.add({
    id: `capital_${cap.name}_${cap.country}`,
    position: Cartesian3.fromDegrees(cap.lon, cap.lat),
    point: {
      pixelSize: 4,
      color: Color.fromAlpha(Color.WHITE, 0.8),
      outlineColor: Color.BLACK,
      outlineWidth: 1,
      distanceDisplayCondition: new DistanceDisplayCondition(0, dist),
      scaleByDistance: new NearFarScalar(1e4, 1.0, dist, 0.5),
    },
    label: {
      text: cap.name,
      font: fontSize(cap.population),
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      style: LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Color.fromAlpha(Color.BLACK, 0.55),
      backgroundPadding: new Cartesian2(6, 3),
      pixelOffset: new Cartesian2(0, -14),
      verticalOrigin: VerticalOrigin.BOTTOM,
      distanceDisplayCondition: new DistanceDisplayCondition(0, dist),
      scaleByDistance: new NearFarScalar(1e4, 1.0, dist, 0.4),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}
