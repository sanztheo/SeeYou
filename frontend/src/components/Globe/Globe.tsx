import { useEffect, useRef } from "react";
import { Viewer as ResiumViewer } from "resium";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  createOsmBuildingsAsync,
  OpenStreetMapImageryProvider,
} from "cesium";
import { hasValidToken } from "../../lib/cesium-config";

interface ViewerRef {
  cesiumElement?: Viewer;
}

export function Globe(): React.ReactElement {
  const viewerRef = useRef<ViewerRef>(null);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    // Replace default imagery with OSM tiles
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      }),
    );

    // Fly to Paris on mount
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(2.3522, 48.8566, 2500),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
      duration: 0,
    });

    // Load OSM 3D Buildings if Ion token available
    if (hasValidToken()) {
      createOsmBuildingsAsync()
        .then((tileset) => {
          if (!viewer.isDestroyed()) {
            viewer.scene.primitives.add(tileset);
          }
        })
        .catch((err: unknown) => {
          console.warn("OSM Buildings unavailable:", err);
        });
    }
  }, []);

  return (
    <ResiumViewer
      ref={viewerRef as React.RefObject<never>}
      full
      animation={false}
      baseLayerPicker={false}
      fullscreenButton={false}
      geocoder={false}
      homeButton={false}
      infoBox={false}
      navigationHelpButton={false}
      sceneModePicker={false}
      selectionIndicator={false}
      timeline={false}
    />
  );
}
