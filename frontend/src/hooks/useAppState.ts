import { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { useAircraftStore } from "./useAircraftStore";
import { useSatelliteStore } from "./useSatelliteStore";
import { fetchFlightRoute } from "../services/flightRoute";
import { fetchCamerasChunked } from "../services/cameraService";
import type { BBox, CameraProgress } from "../services/cameraService";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
  PredictedTrajectory,
} from "../types/aircraft";
import type { SatellitePosition, SatelliteFilter } from "../types/satellite";
import { DEFAULT_SATELLITE_FILTER } from "../types/satellite";
import type { TrafficFilter } from "../types/traffic";
import type { Camera, CameraFilter } from "../types/camera";
import type { ShaderMode } from "../shaders/types";
import type { WsMessage } from "../types/ws";
import type { ConnectionStatus } from "../types/ws";

export interface AppState {
  status: ConnectionStatus;

  aircraft: Map<string, AircraftPosition>;
  totalCount: number;
  militaryCount: number;
  civilianCount: number;
  aircraftFilter: AircraftFilter;
  setAircraftFilter: (f: AircraftFilter) => void;
  selectedAircraft: AircraftPosition | null;
  setSelectedAircraft: (ac: AircraftPosition | null) => void;
  flightRoute: FlightRoute | null;
  routeLoading: boolean;
  predictions: Map<string, PredictedTrajectory>;
  hoveredAircraft: AircraftPosition | null;
  setHoveredAircraft: (
    ac: AircraftPosition | null,
    screenX: number,
    screenY: number,
  ) => void;
  hoverPos: { x: number; y: number };

  satellites: Map<number, SatellitePosition>;
  satelliteTotalCount: number;
  satelliteCategoryCounts: Record<string, number>;
  satelliteFilter: SatelliteFilter;
  setSatelliteFilter: (f: SatelliteFilter) => void;
  selectedSatellite: SatellitePosition | null;
  setSelectedSatellite: (s: SatellitePosition | null) => void;

  trafficFilter: TrafficFilter;
  setTrafficFilter: (f: TrafficFilter) => void;
  trafficLoading: boolean;
  trafficRoadCount: number;
  setTrafficLoadState: (loading: boolean, count: number) => void;

  cameraFilter: CameraFilter;
  setCameraFilter: (f: CameraFilter) => void;
  cameras: Camera[];
  selectedCamera: Camera | null;
  setSelectedCamera: (c: Camera | null) => void;

  viewportBbox: BBox | null;
  setViewportBbox: (bbox: BBox | null) => void;
  cameraProgress: CameraProgress;

  shaderMode: ShaderMode;
  setShaderMode: (m: ShaderMode) => void;
}

export function useAppState(): AppState {
  const aircraftStore = useAircraftStore();
  const satelliteStore = useSatelliteStore();

  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>({
    showCivilian: true,
    showMilitary: true,
  });
  const [selectedAircraft, setSelectedAircraft] =
    useState<AircraftPosition | null>(null);
  const [flightRoute, setFlightRoute] = useState<FlightRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [predictions, setPredictions] = useState<
    Map<string, PredictedTrajectory>
  >(() => new Map());
  const [hoveredAircraft, setHoveredAircraftRaw] =
    useState<AircraftPosition | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const [satelliteFilter, setSatelliteFilter] = useState<SatelliteFilter>(
    DEFAULT_SATELLITE_FILTER,
  );
  const [selectedSatellite, setSelectedSatellite] =
    useState<SatellitePosition | null>(null);

  const [trafficFilter, setTrafficFilter] = useState<TrafficFilter>({
    enabled: false,
    showMotorway: true,
    showTrunk: true,
    showPrimary: true,
    showSecondary: false,
  });
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficRoadCount, setTrafficRoadCount] = useState(0);

  const setTrafficLoadState = useCallback((loading: boolean, count: number) => {
    setTrafficLoading(loading);
    setTrafficRoadCount(count);
  }, []);

  const [cameraFilter, setCameraFilter] = useState<CameraFilter>({
    enabled: false,
    cities: new Set(),
  });
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);

  const [viewportBbox, setViewportBbox] = useState<BBox | null>(null);
  const cameraDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const [cameraProgress, setCameraProgress] = useState<CameraProgress>({
    loaded: 0,
    total: 0,
    done: true,
  });

  const [shaderMode, setShaderMode] = useState<ShaderMode>("normal");

  const handleHoverAircraft = useCallback(
    (ac: AircraftPosition | null, screenX: number, screenY: number): void => {
      setHoveredAircraftRaw(ac);
      setHoverPos({ x: screenX, y: screenY });
    },
    [],
  );

  const handleWsMessage = useCallback(
    (msg: WsMessage): void => {
      if (msg.type === "AircraftUpdate") {
        aircraftStore.update(msg.payload.aircraft);
      } else if (msg.type === "AircraftBatch") {
        const { aircraft, chunk_index, total_chunks } = msg.payload;
        aircraftStore.ingestBatch(aircraft, chunk_index, total_chunks);
      } else if (msg.type === "Predictions") {
        const next = new Map<string, PredictedTrajectory>();
        for (const t of msg.payload.trajectories) {
          next.set(t.icao, t);
        }
        setPredictions(next);
      } else if (msg.type === "SatelliteBatch") {
        const { satellites, chunk_index, total_chunks } = msg.payload;
        satelliteStore.ingestBatch(satellites, chunk_index, total_chunks);
      }
    },
    [
      aircraftStore.update,
      aircraftStore.ingestBatch,
      satelliteStore.ingestBatch,
    ],
  );

  useEffect(() => {
    if (!selectedAircraft?.callsign) {
      setFlightRoute(null);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setFlightRoute(null);

    fetchFlightRoute(
      selectedAircraft.callsign,
      selectedAircraft.lat,
      selectedAircraft.lon,
    )
      .then((route) => {
        if (!cancelled) setFlightRoute(route);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAircraft?.icao]);

  useEffect(() => {
    if (!cameraFilter.enabled || !viewportBbox) {
      setCameras([]);
      setCameraProgress({ loaded: 0, total: 0, done: true });
      if (cameraAbortRef.current) cameraAbortRef.current.abort();
      return;
    }

    if (cameraDebounceRef.current) clearTimeout(cameraDebounceRef.current);

    cameraDebounceRef.current = setTimeout(() => {
      if (cameraAbortRef.current) cameraAbortRef.current.abort();
      const ac = new AbortController();
      cameraAbortRef.current = ac;

      setCameraProgress({ loaded: 0, total: 0, done: false });

      fetchCamerasChunked(
        viewportBbox,
        (cams, progress) => {
          setCameras(cams);
          setCameraProgress(progress);
        },
        ac.signal,
      ).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[Cameras] chunk fetch error:", err);
      });
    }, 300);

    return () => {
      if (cameraDebounceRef.current) clearTimeout(cameraDebounceRef.current);
      if (cameraAbortRef.current) cameraAbortRef.current.abort();
    };
  }, [cameraFilter.enabled, viewportBbox]);

  const { status } = useWebSocket({ onMessage: handleWsMessage });

  return {
    status,

    aircraft: aircraftStore.aircraft,
    totalCount: aircraftStore.totalCount,
    militaryCount: aircraftStore.militaryCount,
    civilianCount: aircraftStore.civilianCount,
    aircraftFilter,
    setAircraftFilter,
    selectedAircraft,
    setSelectedAircraft,
    flightRoute,
    routeLoading,
    predictions,
    hoveredAircraft,
    setHoveredAircraft: handleHoverAircraft,
    hoverPos,

    satellites: satelliteStore.satellites,
    satelliteTotalCount: satelliteStore.totalCount,
    satelliteCategoryCounts: satelliteStore.categoryCounts,
    satelliteFilter,
    setSatelliteFilter,
    selectedSatellite,
    setSelectedSatellite,

    trafficFilter,
    setTrafficFilter,
    trafficLoading,
    trafficRoadCount,
    setTrafficLoadState,

    cameraFilter,
    setCameraFilter,
    cameras,
    selectedCamera,
    setSelectedCamera,

    viewportBbox,
    setViewportBbox,
    cameraProgress,

    shaderMode,
    setShaderMode,
  };
}
