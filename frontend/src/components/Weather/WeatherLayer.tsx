import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
  Credit,
  ImageryLayer,
} from "cesium";
import type { RainViewerData, WeatherFilter } from "../../types/weather";

const TILING_SCHEME = new WebMercatorTilingScheme();
const CREDIT = new Credit("RainViewer", false);
const COLOR_SCHEME = 6;

interface WeatherLayerProps {
  rainViewerData: RainViewerData | null;
  filter: WeatherFilter;
}

export function WeatherLayer({
  rainViewerData,
  filter,
}: WeatherLayerProps): null {
  const { viewer } = useCesium();
  const layersRef = useRef<ImageryLayer[]>([]);
  const frameIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const radarOpacityRef = useRef(filter.radarOpacity);

  useEffect(() => {
    radarOpacityRef.current = filter.radarOpacity;
  }, [filter.radarOpacity]);

  const clearLayers = useCallback(() => {
    const layers = layersRef.current;
    layersRef.current = [];
    frameIndexRef.current = 0;
    if (!viewer || viewer.isDestroyed()) return;
    const imageryLayers = viewer.imageryLayers;
    for (const layer of layers) {
      try {
        if (imageryLayers.contains(layer)) {
          imageryLayers.remove(layer, true);
        }
      } catch {
        // Layer may have been removed externally
      }
    }
  }, [viewer]);

  const stopAnimation = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (!rainViewerData || !filter.showRadar) {
      stopAnimation();
      clearLayers();
      return;
    }

    const frames = [
      ...rainViewerData.radar.past,
      ...rainViewerData.radar.nowcast,
    ];
    if (frames.length === 0) {
      stopAnimation();
      clearLayers();
      return;
    }

    clearLayers();

    const host = rainViewerData.host;
    const newLayers: ImageryLayer[] = [];

    for (const frame of frames) {
      if (viewer.isDestroyed()) break;
      const url = `${host}${frame.path}/256/{z}/{x}/{y}/${COLOR_SCHEME}/1_1.png`;
      const provider = new UrlTemplateImageryProvider({
        url,
        maximumLevel: 7,
        tileWidth: 256,
        tileHeight: 256,
        tilingScheme: TILING_SCHEME,
        credit: CREDIT,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0;
      newLayers.push(layer);
    }

    if (viewer.isDestroyed()) return;

    layersRef.current = newLayers;

    if (newLayers.length > 0) {
      frameIndexRef.current = newLayers.length - 1;
      newLayers[frameIndexRef.current].alpha = radarOpacityRef.current;
    }

    return () => {
      stopAnimation();
      clearLayers();
    };
  }, [viewer, rainViewerData, filter.showRadar, clearLayers, stopAnimation]);

  useEffect(() => {
    const layers = layersRef.current;
    if (layers.length === 0) return;

    stopAnimation();

    timerRef.current = setInterval(() => {
      if (!viewer || viewer.isDestroyed()) return;

      const current = frameIndexRef.current;
      if (layers[current] && viewer.imageryLayers.contains(layers[current])) {
        layers[current].alpha = 0;
      }

      const next = (current + 1) % layers.length;
      frameIndexRef.current = next;

      if (layers[next] && viewer.imageryLayers.contains(layers[next])) {
        layers[next].alpha = radarOpacityRef.current;
      }
    }, filter.animationSpeed);

    return stopAnimation;
  }, [viewer, filter.animationSpeed, stopAnimation]);

  useEffect(() => {
    const layers = layersRef.current;
    if (layers.length === 0) return;
    const current = frameIndexRef.current;
    if (
      layers[current] &&
      viewer &&
      !viewer.isDestroyed() &&
      viewer.imageryLayers.contains(layers[current])
    ) {
      layers[current].alpha = filter.radarOpacity;
    }
  }, [viewer, filter.radarOpacity]);

  return null;
}
