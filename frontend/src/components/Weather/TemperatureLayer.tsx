import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  UrlTemplateImageryProvider,
  SingleTileImageryProvider,
  WebMercatorTilingScheme,
  Credit,
  ImageryLayer,
  Rectangle,
} from "cesium";

const OWM_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined;
const TILING_SCHEME = new WebMercatorTilingScheme();

const TEMP_STOPS: [number, number, number, number][] = [
  [-40, 130, 22, 146],
  [-30, 30, 60, 180],
  [-20, 0, 120, 240],
  [-10, 0, 185, 255],
  [0, 0, 220, 220],
  [10, 80, 220, 80],
  [20, 210, 230, 50],
  [30, 255, 160, 0],
  [40, 255, 50, 0],
  [50, 180, 0, 40],
];

function tempToRGBA(t: number): [number, number, number, number] {
  if (t <= TEMP_STOPS[0][0])
    return [TEMP_STOPS[0][1], TEMP_STOPS[0][2], TEMP_STOPS[0][3], 180];
  const last = TEMP_STOPS[TEMP_STOPS.length - 1];
  if (t >= last[0]) return [last[1], last[2], last[3], 180];
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    const a = TEMP_STOPS[i],
      b = TEMP_STOPS[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const f = (t - a[0]) / (b[0] - a[0]);
      return [
        Math.round(a[1] + f * (b[1] - a[1])),
        Math.round(a[2] + f * (b[2] - a[2])),
        Math.round(a[3] + f * (b[3] - a[3])),
        180,
      ];
    }
  }
  return [0, 0, 0, 0];
}

interface GridData {
  rows: number;
  cols: number;
  temps: (number | null)[];
}

const LAT_MIN = -80,
  LAT_MAX = 80,
  LON_MIN = -180,
  LON_MAX = 180,
  STEP = 10;

async function fetchOpenMeteoGrid(
  signal: AbortSignal,
): Promise<GridData | null> {
  const lats: number[] = [];
  const lons: number[] = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) lats.push(lat);
  for (let lon = LON_MIN; lon < LON_MAX; lon += STEP) lons.push(lon);

  const allLats: number[] = [];
  const allLons: number[] = [];
  for (const lat of lats)
    for (const lon of lons) {
      allLats.push(lat);
      allLons.push(lon);
    }

  const temps: (number | null)[] = new Array(allLats.length).fill(null);
  const BATCH = 200;

  for (let i = 0; i < allLats.length; i += BATCH) {
    if (signal.aborted) return null;
    const bLats = allLats.slice(i, i + BATCH);
    const bLons = allLons.slice(i, i + BATCH);
    try {
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${bLats.join(",")}&longitude=${bLons.join(",")}&current=temperature_2m&forecast_days=1`,
        { signal },
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      const results = Array.isArray(data) ? data : [data];
      for (let j = 0; j < results.length; j++) {
        const t = results[j]?.current?.temperature_2m;
        if (t != null) temps[i + j] = t;
      }
    } catch {
      if (signal.aborted) return null;
    }
  }
  return { rows: lats.length, cols: lons.length, temps };
}

function renderHeatmap(grid: GridData): string {
  const W = 1024,
    H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const latRange = LAT_MAX - LAT_MIN;
  const lonRange = LON_MAX - LON_MIN;

  for (let py = 0; py < H; py++) {
    const lat = LAT_MAX - (py / H) * latRange;
    const fy = ((LAT_MAX - lat) / latRange) * (grid.rows - 1);
    const iy = Math.min(Math.floor(fy), grid.rows - 2);
    const dy = fy - iy;

    for (let px = 0; px < W; px++) {
      const lon = LON_MIN + (px / W) * lonRange;
      const fx = ((lon - LON_MIN) / lonRange) * (grid.cols - 1);
      const ix = Math.min(Math.floor(fx), grid.cols - 2);
      const dx = fx - ix;

      const t00 = grid.temps[iy * grid.cols + ix];
      const t10 = grid.temps[iy * grid.cols + ix + 1];
      const t01 = grid.temps[(iy + 1) * grid.cols + ix];
      const t11 = grid.temps[(iy + 1) * grid.cols + ix + 1];
      if (t00 == null || t10 == null || t01 == null || t11 == null) continue;

      const temp =
        t00 * (1 - dx) * (1 - dy) +
        t10 * dx * (1 - dy) +
        t01 * (1 - dx) * dy +
        t11 * dx * dy;
      const rgba = tempToRGBA(temp);
      const idx = (py * W + px) * 4;
      img.data[idx] = rgba[0];
      img.data[idx + 1] = rgba[1];
      img.data[idx + 2] = rgba[2];
      img.data[idx + 3] = rgba[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

async function probeOwm(): Promise<boolean> {
  if (!OWM_KEY) return false;
  try {
    const r = await fetch(
      `https://tile.openweathermap.org/map/temp_new/0/0/0.png?appid=${OWM_KEY}`,
      { method: "HEAD" },
    );
    return r.ok;
  } catch {
    return false;
  }
}

interface TemperatureLayerProps {
  opacity: number;
}

export function TemperatureLayer({ opacity }: TemperatureLayerProps): null {
  const { viewer } = useCesium();
  const layerRef = useRef<ImageryLayer | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      const owmOk = await probeOwm();
      if (cancelled || !viewer || viewer.isDestroyed()) return;

      if (owmOk) {
        const provider = new UrlTemplateImageryProvider({
          url: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_KEY}`,
          maximumLevel: 7,
          tileWidth: 256,
          tileHeight: 256,
          tilingScheme: TILING_SCHEME,
          credit: new Credit("OpenWeatherMap", false),
        });
        if (cancelled || viewer.isDestroyed()) return;
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = opacity;
        layerRef.current = layer;
        return;
      }

      const grid = await fetchOpenMeteoGrid(ac.signal);
      if (!grid || cancelled || !viewer || viewer.isDestroyed()) return;

      const dataUrl = renderHeatmap(grid);
      if (cancelled || viewer.isDestroyed()) return;

      try {
        const provider = await SingleTileImageryProvider.fromUrl(dataUrl, {
          rectangle: Rectangle.fromDegrees(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX),
          credit: new Credit("Open-Meteo", false),
        });
        if (cancelled || viewer.isDestroyed()) return;
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = opacity;
        layerRef.current = layer;
      } catch (err) {
        console.warn("Temperature layer failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      if (!viewer || viewer.isDestroyed()) return;
      try {
        if (
          layerRef.current &&
          viewer.imageryLayers.contains(layerRef.current)
        ) {
          viewer.imageryLayers.remove(layerRef.current, true);
        }
      } catch {
        /* noop */
      }
      layerRef.current = null;
    };
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      layerRef.current &&
      viewer &&
      !viewer.isDestroyed() &&
      viewer.imageryLayers.contains(layerRef.current)
    ) {
      layerRef.current.alpha = opacity;
    }
  }, [viewer, opacity]);

  return null;
}
