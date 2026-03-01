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
import { SatelliteLayer } from "../Satellite/SatelliteLayer";
import { TrafficLayer } from "../Traffic/TrafficLayer";
import { CameraLayer } from "../Camera/CameraLayer";
import { ShaderManager } from "../../shaders/ShaderManager";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
  PredictedTrajectory,
} from "../../types/aircraft";
import type { SatellitePosition, SatelliteFilter } from "../../types/satellite";
import { DEFAULT_SATELLITE_FILTER } from "../../types/satellite";
import type { TrafficFilter, Road } from "../../types/traffic";
import type { Camera, CameraFilter } from "../../types/camera";
import type { ShaderMode } from "../../shaders/types";

interface ViewerRef {
  cesiumElement?: Viewer;
}

interface GlobeProps {
  aircraft?: Map<string, AircraftPosition>;
  filter?: AircraftFilter;
  trackedIcao?: string | null;
  onSelectAircraft?: (aircraft: AircraftPosition) => void;
  onHoverAircraft?: (
    aircraft: AircraftPosition | null,
    screenX: number,
    screenY: number,
  ) => void;
  flightRoute?: FlightRoute | null;
  predictions?: Map<string, PredictedTrajectory>;

  satellites?: Map<number, SatellitePosition>;
  satelliteFilter?: SatelliteFilter;
  onSelectSatellite?: (sat: SatellitePosition) => void;

  trafficFilter?: TrafficFilter;
  roads?: Road[];

  cameras?: Camera[];
  cameraFilter?: CameraFilter;
  onSelectCamera?: (cam: Camera) => void;

  shaderMode?: ShaderMode;
}

const DEFAULT_AIRCRAFT_FILTER: AircraftFilter = {
  showCivilian: true,
  showMilitary: true,
};

export function Globe({
  aircraft,
  filter,
  trackedIcao,
  onSelectAircraft,
  onHoverAircraft,
  flightRoute,
  predictions,
  satellites,
  satelliteFilter,
  onSelectSatellite,
  trafficFilter,
  roads,
  cameras,
  cameraFilter,
  onSelectCamera,
  shaderMode,
}: GlobeProps): React.ReactElement {
  const viewerRef = useRef<ViewerRef>(null);
  const shaderManagerRef = useRef<ShaderManager | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
    viewer.clock.shouldAnimate = true;

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      }),
    );

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(2.3522, 48.8566, 2500),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
      duration: 0,
    });

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

    shaderManagerRef.current = new ShaderManager(viewer);
    return () => shaderManagerRef.current?.destroy();
  }, []);

  useEffect(() => {
    shaderManagerRef.current?.setMode(shaderMode ?? "normal");
  }, [shaderMode]);

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
          filter={filter ?? DEFAULT_AIRCRAFT_FILTER}
          trackedIcao={trackedIcao ?? null}
          onSelect={onSelectAircraft}
          onHover={onHoverAircraft}
          flightRoute={flightRoute ?? null}
          predictions={predictions ?? new Map()}
        />
      )}

      {satellites && satellites.size > 0 && (
        <SatelliteLayer
          satellites={satellites}
          filter={satelliteFilter ?? DEFAULT_SATELLITE_FILTER}
          onSelect={onSelectSatellite}
        />
      )}

      {trafficFilter?.enabled && (
        <TrafficLayer filter={trafficFilter} roads={roads ?? []} />
      )}

      {cameraFilter?.enabled && cameras && (
        <CameraLayer
          cameras={cameras}
          filter={cameraFilter}
          onSelect={onSelectCamera ?? (() => {})}
        />
      )}
    </ResiumViewer>
  );
}
