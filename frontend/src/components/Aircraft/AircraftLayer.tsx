import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import { CustomDataSource, type Viewer } from "cesium";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
  PredictedTrajectory,
} from "../../types/aircraft";
import { cullEntities } from "./aircraftUtils";
import { setupInteractions } from "./AircraftInteractions";
import { useAircraftBillboards } from "./AircraftBillboards";
import { useFlightRoute } from "./AircraftRouteOverlay";
import { usePredictions } from "./AircraftPredictions";

interface AircraftLayerProps {
  aircraft: Map<string, AircraftPosition>;
  filter: AircraftFilter;
  trackedIcao: string | null;
  onSelect?: (aircraft: AircraftPosition) => void;
  onHover?: (
    aircraft: AircraftPosition | null,
    screenX: number,
    screenY: number,
  ) => void;
  flightRoute: FlightRoute | null;
  predictions: Map<string, PredictedTrajectory>;
}

export function AircraftLayer({
  aircraft,
  filter,
  trackedIcao,
  onSelect,
  onHover,
  flightRoute,
  predictions,
}: AircraftLayerProps): null {
  const { viewer } = useCesium();
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const routeDsRef = useRef<CustomDataSource | null>(null);
  const predDsRef = useRef<CustomDataSource | null>(null);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const aircraftRef = useRef(aircraft);
  const trackedIcaoRef = useRef(trackedIcao);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);
  useEffect(() => {
    aircraftRef.current = aircraft;
  }, [aircraft]);
  useEffect(() => {
    trackedIcaoRef.current = trackedIcao;
  }, [trackedIcao]);
  useEffect(() => {
    viewerRef.current = viewer ?? null;
  }, [viewer]);

  // Mount datasources, interaction handlers, and camera-change listener
  useEffect(() => {
    if (!viewer) return;

    const ds = new CustomDataSource("aircraft");
    viewer.dataSources.add(ds);
    dataSourceRef.current = ds;

    const routeDs = new CustomDataSource("flightRoute");
    viewer.dataSources.add(routeDs);
    routeDsRef.current = routeDs;

    const predDs = new CustomDataSource("predictions");
    viewer.dataSources.add(predDs);
    predDsRef.current = predDs;

    const canvas = viewer.scene.canvas as HTMLCanvasElement;
    const cleanupInteractions = setupInteractions(
      viewer,
      canvas,
      aircraftRef,
      onSelectRef,
      onHoverRef,
    );

    const onCameraChanged = (): void => {
      if (viewer.isDestroyed()) return;
      cullEntities(viewer, ds, trackedIcaoRef.current);
    };
    viewer.camera.changed.addEventListener(onCameraChanged);

    return (): void => {
      cleanupInteractions();
      viewer.camera.changed.removeEventListener(onCameraChanged);
      if (!viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
        viewer.dataSources.remove(routeDs, true);
        viewer.dataSources.remove(predDs, true);
      }
      dataSourceRef.current = null;
      routeDsRef.current = null;
      predDsRef.current = null;
    };
  }, [viewer]);

  // Track selected entity — camera follows it continuously
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    const ds = dataSourceRef.current;

    if (!trackedIcao || !ds) {
      v.trackedEntity = undefined;
      return;
    }

    const entity = ds.entities.getById(trackedIcao);
    if (entity) {
      v.trackedEntity = entity;
    }
  }, [trackedIcao, aircraft]);

  useAircraftBillboards(
    dataSourceRef,
    aircraft,
    filter,
    viewerRef,
    trackedIcaoRef,
  );
  useFlightRoute(routeDsRef, dataSourceRef, flightRoute, trackedIcao, aircraft);
  usePredictions(predDsRef, predictions, aircraft, filter);

  return null;
}
