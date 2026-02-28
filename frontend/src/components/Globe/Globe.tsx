import { useEffect, useRef } from "react";
import { Viewer as ResiumViewer } from "resium";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  ClockStep,
  createOsmBuildingsAsync,
  OpenStreetMapImageryProvider,
} from "cesium";
import { hasValidToken } from "../../lib/cesium-config";
import { AircraftLayer } from "../Aircraft/AircraftLayer";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
} from "../../types/aircraft";

interface ViewerRef {
  cesiumElement?: Viewer;
}

interface GlobeProps {
  aircraft?: Map<string, AircraftPosition>;
  filter?: AircraftFilter;
  trackedIcao?: string | null;
  onSelectAircraft?: (aircraft: AircraftPosition) => void;
  flightRoute?: FlightRoute | null;
}

const DEFAULT_FILTER: AircraftFilter = {
  showCivilian: true,
  showMilitary: true,
};

export function Globe({
  aircraft,
  filter,
  trackedIcao,
  onSelectAircraft,
  flightRoute,
}: GlobeProps): React.ReactElement {
  const viewerRef = useRef<ViewerRef>(null);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    // Real-time clock for SampledPositionProperty interpolation
    viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
    viewer.clock.shouldAnimate = true;

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
    >
      {aircraft && (
        <AircraftLayer
          aircraft={aircraft}
          filter={filter ?? DEFAULT_FILTER}
          trackedIcao={trackedIcao ?? null}
          onSelect={onSelectAircraft}
          flightRoute={flightRoute ?? null}
        />
      )}
    </ResiumViewer>
  );
}
