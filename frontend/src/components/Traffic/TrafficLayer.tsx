import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import { UrlTemplateImageryProvider, ImageryLayer } from "cesium";
import type { TrafficFilter } from "../../types/traffic";
import { FlowLayer } from "./FlowLayer";
import { IncidentLayer } from "./IncidentLayer";
import { fetchTomTomTilesUrl } from "../../services/trafficService";

interface TrafficLayerProps {
  filter: TrafficFilter;
}

export function TrafficLayer({
  filter,
}: TrafficLayerProps): React.ReactElement | null {
  const { viewer } = useCesium();
  const tilesLayerRef = useRef<ImageryLayer | null>(null);

  // --- TomTom raster tiles overlay ---
  useEffect(() => {
    if (!viewer || !filter.enabled || !filter.showTilesOverlay) {
      if (tilesLayerRef.current && viewer && !viewer.isDestroyed()) {
        viewer.imageryLayers.remove(tilesLayerRef.current, true);
        tilesLayerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    fetchTomTomTilesUrl().then((urls) => {
      if (cancelled || !urls || !viewer || viewer.isDestroyed()) return;

      if (tilesLayerRef.current) {
        viewer.imageryLayers.remove(tilesLayerRef.current, true);
      }

      const provider = new UrlTemplateImageryProvider({
        url: urls.flow_url,
        minimumLevel: 0,
        maximumLevel: 18,
      });

      const layer = viewer.imageryLayers.addImageryProvider(provider);
      layer.alpha = 0.7;
      tilesLayerRef.current = layer;
    });

    return () => {
      cancelled = true;
      if (tilesLayerRef.current && viewer && !viewer.isDestroyed()) {
        viewer.imageryLayers.remove(tilesLayerRef.current, true);
        tilesLayerRef.current = null;
      }
    };
  }, [viewer, filter.enabled, filter.showTilesOverlay]);

  return (
    <>
      {filter.enabled && filter.showFlowSegments && (
        <FlowLayer filter={filter} />
      )}
      {filter.enabled && filter.showIncidents && (
        <IncidentLayer filter={filter} />
      )}
    </>
  );
}
