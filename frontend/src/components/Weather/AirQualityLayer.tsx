import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  UrlTemplateImageryProvider,
  WebMercatorTilingScheme,
  Credit,
  ImageryLayer,
} from "cesium";

const TOKEN = import.meta.env.VITE_WAQI_TOKEN as string | undefined;
const TILING_SCHEME = new WebMercatorTilingScheme();
const CREDIT = new Credit("WAQI / AQICN", false);

interface AirQualityLayerProps {
  opacity: number;
}

export function AirQualityLayer({ opacity }: AirQualityLayerProps): null {
  const { viewer } = useCesium();
  const layerRef = useRef<ImageryLayer | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !TOKEN) return;

    const provider = new UrlTemplateImageryProvider({
      url: `https://tiles.waqi.info/tiles/usepa-aqi/{z}/{x}/{y}.png?token=${TOKEN}`,
      maximumLevel: 7,
      tileWidth: 256,
      tileHeight: 256,
      tilingScheme: TILING_SCHEME,
      credit: CREDIT,
    });

    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = opacity;
    layerRef.current = layer;

    return () => {
      if (viewer.isDestroyed()) return;
      try {
        if (
          layerRef.current &&
          viewer.imageryLayers.contains(layerRef.current)
        ) {
          viewer.imageryLayers.remove(layerRef.current, true);
        }
      } catch {
        // layer may have been removed externally
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
