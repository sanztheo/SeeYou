import { useEffect, useRef } from "react";
import { useCesium } from "resium";
import {
  BillboardCollection,
  LabelCollection,
  CustomDataSource,
  JulianDate,
  type Viewer,
} from "cesium";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
  PredictedTrajectory,
} from "../../types/aircraft";
import { makePositionProperty } from "./aircraftUtils";
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
  const bbCollRef = useRef<BillboardCollection | null>(null);
  const lblCollRef = useRef<LabelCollection | null>(null);
  const routeDsRef = useRef<CustomDataSource | null>(null);
  const predDsRef = useRef<CustomDataSource | null>(null);
  const trackDsRef = useRef<CustomDataSource | null>(null);
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

  useEffect(() => {
    if (!viewer) return;

    const bbColl = viewer.scene.primitives.add(
      new BillboardCollection({ scene: viewer.scene }),
    ) as BillboardCollection;
    const lblColl = viewer.scene.primitives.add(
      new LabelCollection({ scene: viewer.scene }),
    ) as LabelCollection;
    bbCollRef.current = bbColl;
    lblCollRef.current = lblColl;

    const routeDs = new CustomDataSource("flightRoute");
    viewer.dataSources.add(routeDs);
    routeDsRef.current = routeDs;

    const predDs = new CustomDataSource("predictions");
    viewer.dataSources.add(predDs);
    predDsRef.current = predDs;

    const trackDs = new CustomDataSource("tracking");
    viewer.dataSources.add(trackDs);
    trackDsRef.current = trackDs;

    const canvas = viewer.scene.canvas as HTMLCanvasElement;
    const cleanupInteractions = setupInteractions(
      viewer,
      canvas,
      aircraftRef,
      onSelectRef,
      onHoverRef,
    );

    return (): void => {
      cleanupInteractions();
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(bbColl);
        viewer.scene.primitives.remove(lblColl);
        viewer.dataSources.remove(routeDs, true);
        viewer.dataSources.remove(predDs, true);
        viewer.dataSources.remove(trackDs, true);
      }
      bbCollRef.current = null;
      lblCollRef.current = null;
      routeDsRef.current = null;
      predDsRef.current = null;
      trackDsRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const v = viewerRef.current;
    const trackDs = trackDsRef.current;
    if (!v || v.isDestroyed() || !trackDs) return;

    if (!trackedIcao) {
      trackDs.entities.removeAll();
      v.trackedEntity = undefined;
      return;
    }

    const ac = aircraft.get(trackedIcao);
    if (!ac) {
      trackDs.entities.removeAll();
      v.trackedEntity = undefined;
      return;
    }

    const now = JulianDate.now();
    const existing = trackDs.entities.getById(trackedIcao);
    if (existing) {
      existing.position = makePositionProperty(ac, now) as never;
    } else {
      trackDs.entities.removeAll();
      const entity = trackDs.entities.add({
        id: trackedIcao,
        position: makePositionProperty(ac, now) as never,
      });
      v.trackedEntity = entity;
    }
  }, [trackedIcao, aircraft]);

  useAircraftBillboards(bbCollRef, lblCollRef, aircraft, filter);
  useFlightRoute(routeDsRef, trackDsRef, flightRoute, trackedIcao, aircraft);
  usePredictions(predDsRef, predictions, aircraft, filter);

  return null;
}
