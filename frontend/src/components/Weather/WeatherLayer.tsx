import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  CustomDataSource,
  Cartesian3,
  Color,
  NearFarScalar,
  VerticalOrigin,
  Math as CesiumMath,
} from "cesium";
import type { WeatherPoint, WeatherFilter } from "../../types/weather";

function makeArrowDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M16 2 L22 14 L18 12 L18 30 L14 30 L14 12 L10 14 Z" fill="white" stroke="black" stroke-width="0.5"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const ARROW_URI = makeArrowDataUri();

const TEMP_COLD = Color.fromCssColorString("#3b82f6");
const TEMP_COOL = Color.fromCssColorString("#06b6d4");
const TEMP_MILD = Color.fromCssColorString("#22c55e");
const TEMP_WARM = Color.fromCssColorString("#eab308");
const TEMP_HOT = Color.fromCssColorString("#ef4444");

function temperatureColor(tempC: number): Color {
  if (tempC <= -10) return TEMP_COLD;
  if (tempC <= 0) {
    const t = (tempC + 10) / 10;
    return Color.lerp(TEMP_COLD, TEMP_COOL, t, new Color());
  }
  if (tempC <= 15) {
    const t = tempC / 15;
    return Color.lerp(TEMP_COOL, TEMP_MILD, t, new Color());
  }
  if (tempC <= 25) {
    const t = (tempC - 15) / 10;
    return Color.lerp(TEMP_MILD, TEMP_WARM, t, new Color());
  }
  if (tempC <= 35) {
    const t = (tempC - 25) / 10;
    return Color.lerp(TEMP_WARM, TEMP_HOT, t, new Color());
  }
  return TEMP_HOT;
}

function windArrowScale(speedMs: number): number {
  return Math.min(0.6 + speedMs * 0.04, 1.6);
}

interface WeatherLayerProps {
  points: WeatherPoint[];
  filter: WeatherFilter;
}

export function WeatherLayer({ points, filter }: WeatherLayerProps): null {
  const { viewer } = useCesium();
  const dsRef = useRef<CustomDataSource | null>(null);

  useEffect(() => {
    if (!viewer) return;
    const ds = new CustomDataSource("weather");
    viewer.dataSources.add(ds);
    dsRef.current = ds;
    return () => {
      if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
      dsRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds) return;

    ds.entities.removeAll();

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const position = Cartesian3.fromDegrees(p.lon, p.lat);
      const color = temperatureColor(p.temperature_c);

      if (filter.showTemperature) {
        ds.entities.add({
          id: `weather-temp-${i}`,
          position,
          point: {
            pixelSize: 6,
            color,
            outlineColor: Color.BLACK,
            outlineWidth: 1,
            scaleByDistance: new NearFarScalar(100_000, 1.0, 15_000_000, 0.3),
          },
        });
      }

      if (filter.showWind && p.wind_speed_ms > 0.5) {
        ds.entities.add({
          id: `weather-wind-${i}`,
          position,
          billboard: {
            image: ARROW_URI,
            width: 20,
            height: 20,
            scale: windArrowScale(p.wind_speed_ms),
            rotation: CesiumMath.toRadians(-p.wind_direction_deg),
            alignedAxis: Cartesian3.UNIT_Z,
            verticalOrigin: VerticalOrigin.CENTER,
            color: color.withAlpha(0.85),
            scaleByDistance: new NearFarScalar(100_000, 1.0, 15_000_000, 0.2),
          },
        });
      }
    }
  }, [points, filter.showWind, filter.showTemperature]);

  return null;
}
