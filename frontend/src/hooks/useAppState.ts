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
import type {
  WeatherFilter,
  WeatherPoint,
  RainViewerData,
} from "../types/weather";
import type { MetarFilter, MetarStation } from "../types/metar";
import type { NaturalEvent, EventFilter } from "../types/events";
import type { ShaderMode } from "../shaders/types";
import type { WsMessage } from "../types/ws";
import type { ConnectionStatus } from "../types/ws";
import { fetchWeather } from "../services/weatherService";
import { fetchRainViewerFrames } from "../services/weatherTileService";
import { fetchEvents } from "../services/eventService";
import { fetchCables } from "../services/cablesService";
import { fetchSeismic } from "../services/seismicService";
import { fetchFires } from "../services/firesService";
import { fetchGdelt } from "../services/gdeltService";
import { fetchMilitaryBases } from "../services/militaryService";
import { fetchNuclearSites } from "../services/nuclearService";
import { fetchMaritime } from "../services/maritimeService";
import { fetchCyber } from "../services/cyberService";
import { fetchSpaceWeather } from "../services/spaceWeatherService";

import type {
  SubmarineCable,
  LandingPoint,
  CablesFilter,
} from "../types/cables";
import type { Earthquake, SeismicFilter } from "../types/seismic";
import type { FireHotspot, FiresFilter } from "../types/fires";
import type { GdeltEvent, GdeltFilter } from "../types/gdelt";
import type { MilitaryBase, MilitaryFilter } from "../types/military";
import type { NuclearSite, NuclearFilter } from "../types/nuclear";
import type { Vessel, MaritimeFilter } from "../types/maritime";
import type { CyberThreat, CyberFilter } from "../types/cyber";
import type {
  AuroraPoint,
  SpaceWeatherAlert,
  SpaceWeatherFilter,
} from "../types/spaceWeather";
import type { ConvergenceZone } from "../components/Convergence/ConvergenceAlertLayer";

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

  cameraFilter: CameraFilter;
  setCameraFilter: (f: CameraFilter) => void;
  cameras: Camera[];
  selectedCamera: Camera | null;
  setSelectedCamera: (c: Camera | null) => void;

  weatherFilter: WeatherFilter;
  setWeatherFilter: (f: WeatherFilter) => void;
  weatherPoints: WeatherPoint[];
  weatherLoading: boolean;
  rainViewerData: RainViewerData | null;

  metarFilter: MetarFilter;
  setMetarFilter: (f: MetarFilter) => void;
  metarStations: MetarStation[];
  selectedMetar: MetarStation | null;
  setSelectedMetar: (s: MetarStation | null) => void;

  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  events: NaturalEvent[];
  eventsLoading: boolean;
  selectedEvent: NaturalEvent | null;
  setSelectedEvent: (e: NaturalEvent | null) => void;

  viewportBbox: BBox | null;
  setViewportBbox: (bbox: BBox | null) => void;
  cameraProgress: CameraProgress;

  flyToTarget: { lat: number; lon: number; alt: number } | null;
  setFlyToTarget: (
    target: { lat: number; lon: number; alt: number } | null,
  ) => void;

  shaderMode: ShaderMode;
  setShaderMode: (m: ShaderMode) => void;

  // Intelligence layers
  cablesFilter: CablesFilter;
  setCablesFilter: (f: CablesFilter) => void;
  cables: SubmarineCable[];
  landingPoints: LandingPoint[];
  selectedCable: SubmarineCable | null;
  setSelectedCable: (c: SubmarineCable | null) => void;

  seismicFilter: SeismicFilter;
  setSeismicFilter: (f: SeismicFilter) => void;
  earthquakes: Earthquake[];
  selectedEarthquake: Earthquake | null;
  setSelectedEarthquake: (e: Earthquake | null) => void;

  firesFilter: FiresFilter;
  setFiresFilter: (f: FiresFilter) => void;
  fires: FireHotspot[];
  selectedFire: FireHotspot | null;
  setSelectedFire: (f: FireHotspot | null) => void;

  gdeltFilter: GdeltFilter;
  setGdeltFilter: (f: GdeltFilter) => void;
  gdeltEvents: GdeltEvent[];
  selectedGdeltEvent: GdeltEvent | null;
  setSelectedGdeltEvent: (e: GdeltEvent | null) => void;

  militaryFilter: MilitaryFilter;
  setMilitaryFilter: (f: MilitaryFilter) => void;
  militaryBases: MilitaryBase[];
  selectedMilitaryBase: MilitaryBase | null;
  setSelectedMilitaryBase: (b: MilitaryBase | null) => void;

  nuclearFilter: NuclearFilter;
  setNuclearFilter: (f: NuclearFilter) => void;
  nuclearSites: NuclearSite[];
  selectedNuclearSite: NuclearSite | null;
  setSelectedNuclearSite: (s: NuclearSite | null) => void;

  maritimeFilter: MaritimeFilter;
  setMaritimeFilter: (f: MaritimeFilter) => void;
  vessels: Vessel[];
  selectedVessel: Vessel | null;
  setSelectedVessel: (v: Vessel | null) => void;

  cyberFilter: CyberFilter;
  setCyberFilter: (f: CyberFilter) => void;
  cyberThreats: CyberThreat[];
  selectedCyberThreat: CyberThreat | null;
  setSelectedCyberThreat: (t: CyberThreat | null) => void;

  spaceWeatherFilter: SpaceWeatherFilter;
  setSpaceWeatherFilter: (f: SpaceWeatherFilter) => void;
  aurora: AuroraPoint[];
  kpIndex: number;
  spaceWeatherAlerts: SpaceWeatherAlert[];

  convergenceZones: ConvergenceZone[];

  showSpaceWeatherPopup: boolean;
  setShowSpaceWeatherPopup: (v: boolean) => void;
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
    showTilesOverlay: true,
    showFlowSegments: true,
    showIncidents: true,
    showAccidents: true,
    showRoadWorks: true,
    showClosures: true,
  });

  const [cameraFilter, setCameraFilter] = useState<CameraFilter>({
    enabled: false,
    cities: new Set(),
    sources: new Set(),
  });
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);

  const [viewportBbox, setViewportBbox] = useState<BBox | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const [cameraProgress, setCameraProgress] = useState<CameraProgress>({
    loaded: 0,
    total: 0,
    done: true,
  });

  const [flyToTarget, setFlyToTarget] = useState<{
    lat: number;
    lon: number;
    alt: number;
  } | null>(null);

  const [weatherFilter, setWeatherFilter] = useState<WeatherFilter>({
    enabled: false,
    showRadar: true,
    showWind: true,
    showTemperature: false,
    showAirQuality: false,
    radarOpacity: 0.7,
    windOpacity: 0.6,
    temperatureOpacity: 0.5,
    airQualityOpacity: 0.5,
    animationSpeed: 500,
  });
  const [weatherPoints, setWeatherPoints] = useState<WeatherPoint[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [rainViewerData, setRainViewerData] = useState<RainViewerData | null>(
    null,
  );

  const [metarFilter, setMetarFilter] = useState<MetarFilter>({
    enabled: false,
    categories: new Set(),
  });
  const [metarStations, setMetarStations] = useState<MetarStation[]>([]);
  const [selectedMetar, setSelectedMetar] = useState<MetarStation | null>(null);

  const [eventFilter, setEventFilter] = useState<EventFilter>({
    enabled: false,
    categories: new Set(),
  });
  const [events, setEvents] = useState<NaturalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<NaturalEvent | null>(null);

  const [shaderMode, setShaderMode] = useState<ShaderMode>("normal");

  // Intelligence state
  const [cablesFilter, setCablesFilter] = useState<CablesFilter>({
    enabled: false,
  });
  const [cables, setCables] = useState<SubmarineCable[]>([]);
  const [landingPoints, setLandingPoints] = useState<LandingPoint[]>([]);
  const [selectedCable, setSelectedCable] = useState<SubmarineCable | null>(
    null,
  );

  const [seismicFilter, setSeismicFilter] = useState<SeismicFilter>({
    enabled: false,
    minMagnitude: 4.0,
  });
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [selectedEarthquake, setSelectedEarthquake] =
    useState<Earthquake | null>(null);

  const [firesFilter, setFiresFilter] = useState<FiresFilter>({
    enabled: false,
    minConfidence: "nominal",
  });
  const [fires, setFires] = useState<FireHotspot[]>([]);
  const [selectedFire, setSelectedFire] = useState<FireHotspot | null>(null);

  const [gdeltFilter, setGdeltFilter] = useState<GdeltFilter>({
    enabled: false,
  });
  const [gdeltEvents, setGdeltEvents] = useState<GdeltEvent[]>([]);
  const [selectedGdeltEvent, setSelectedGdeltEvent] =
    useState<GdeltEvent | null>(null);

  const [militaryFilter, setMilitaryFilter] = useState<MilitaryFilter>({
    enabled: false,
    branches: new Set(),
  });
  const [militaryBases, setMilitaryBases] = useState<MilitaryBase[]>([]);
  const [selectedMilitaryBase, setSelectedMilitaryBase] =
    useState<MilitaryBase | null>(null);

  const [nuclearFilter, setNuclearFilter] = useState<NuclearFilter>({
    enabled: false,
    types: new Set(),
  });
  const [nuclearSites, setNuclearSites] = useState<NuclearSite[]>([]);
  const [selectedNuclearSite, setSelectedNuclearSite] =
    useState<NuclearSite | null>(null);

  const [maritimeFilter, setMaritimeFilter] = useState<MaritimeFilter>({
    enabled: false,
    sanctionedOnly: false,
  });
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);

  const [cyberFilter, setCyberFilter] = useState<CyberFilter>({
    enabled: false,
    minConfidence: 50,
  });
  const [cyberThreats, setCyberThreats] = useState<CyberThreat[]>([]);
  const [selectedCyberThreat, setSelectedCyberThreat] =
    useState<CyberThreat | null>(null);

  const [spaceWeatherFilter, setSpaceWeatherFilter] =
    useState<SpaceWeatherFilter>({ enabled: false });
  const [aurora, setAurora] = useState<AuroraPoint[]>([]);
  const [kpIndex, setKpIndex] = useState(0);
  const [spaceWeatherAlerts, setSpaceWeatherAlerts] = useState<
    SpaceWeatherAlert[]
  >([]);

  const [convergenceZones, setConvergenceZones] = useState<ConvergenceZone[]>(
    [],
  );

  const [showSpaceWeatherPopup, setShowSpaceWeatherPopup] = useState(false);

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
      } else if (msg.type === "MetarUpdate") {
        setMetarStations(msg.payload.stations);
      } else if (msg.type === "SeismicUpdate") {
        setEarthquakes(msg.payload.earthquakes);
      } else if (msg.type === "FireUpdate") {
        setFires(msg.payload.fires as FireHotspot[]);
      } else if (msg.type === "GdeltUpdate") {
        setGdeltEvents(msg.payload.events);
      } else if (msg.type === "MaritimeUpdate") {
        setVessels(msg.payload.vessels as Vessel[]);
      } else if (msg.type === "CyberThreatUpdate") {
        setCyberThreats(msg.payload.threats as CyberThreat[]);
      } else if (msg.type === "SpaceWeatherUpdate") {
        setAurora(msg.payload.aurora);
        setKpIndex(msg.payload.kp_index);
        setSpaceWeatherAlerts(msg.payload.alerts);
      } else if (msg.type === "ConvergenceAlert") {
        setConvergenceZones(msg.payload.zones);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!cameraFilter.enabled) {
      setCameras([]);
      setCameraProgress({ loaded: 0, total: 0, done: true });
      if (cameraAbortRef.current) cameraAbortRef.current.abort();
      return;
    }

    const ac = new AbortController();
    cameraAbortRef.current = ac;
    setCameraProgress({ loaded: 0, total: 0, done: false });

    let retries = 0;
    const MAX_RETRIES = 8;

    const doFetch = (): void => {
      fetchCamerasChunked(
        undefined,
        (cams, progress) => {
          setCameras(cams);
          setCameraProgress(progress);
        },
        ac.signal,
      ).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[Cameras] fetch error:", err);
        retries++;
        if (retries <= MAX_RETRIES && !ac.signal.aborted) {
          const delay = Math.min(retries * 3000, 15000);
          setTimeout(doFetch, delay);
        } else {
          setCameraProgress({ loaded: 0, total: 0, done: true });
        }
      });
    };

    doFetch();
    return () => ac.abort();
  }, [cameraFilter.enabled]);

  useEffect(() => {
    if (!weatherFilter.enabled) {
      setWeatherPoints([]);
      setRainViewerData(null);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    setWeatherLoading(true);

    Promise.all([
      fetchWeather(ac.signal).catch(() => null),
      fetchRainViewerFrames(ac.signal).catch(() => null),
    ])
      .then(([grid, rvData]) => {
        if (cancelled || ac.signal.aborted) return;
        if (grid) setWeatherPoints(grid.points);
        if (rvData) setRainViewerData(rvData);
      })
      .finally(() => {
        if (!cancelled && !ac.signal.aborted) setWeatherLoading(false);
      });

    const interval = setInterval(() => {
      if (cancelled) return;
      Promise.all([
        fetchWeather(ac.signal).catch(() => null),
        fetchRainViewerFrames(ac.signal).catch(() => null),
      ]).then(([grid, rvData]) => {
        if (cancelled || ac.signal.aborted) return;
        if (grid) setWeatherPoints(grid.points);
        if (rvData) setRainViewerData(rvData);
      });
    }, 600_000);

    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(interval);
    };
  }, [weatherFilter.enabled]);

  useEffect(() => {
    if (!eventFilter.enabled) {
      setEvents([]);
      setEventsLoading(false);
      return;
    }
    const ac = new AbortController();
    setEventsLoading(true);
    fetchEvents(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setEvents(data.events);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[Events] fetch error:", e);
      })
      .finally(() => {
        if (!ac.signal.aborted) setEventsLoading(false);
      });

    const interval = setInterval(() => {
      fetchEvents(ac.signal)
        .then((data) => {
          if (!ac.signal.aborted) setEvents(data.events);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          console.error("[Events] refetch error:", e);
        });
    }, 1_800_000);

    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [eventFilter.enabled]);

  // Intelligence data fetchers

  useEffect(() => {
    if (!cablesFilter.enabled) {
      setCables([]);
      setLandingPoints([]);
      return;
    }
    const ac = new AbortController();
    fetchCables(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) {
          setCables(data.cables);
          setLandingPoints(data.landing_points);
        }
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Cables]", e);
      });
    return () => ac.abort();
  }, [cablesFilter.enabled]);

  useEffect(() => {
    if (!seismicFilter.enabled) {
      setEarthquakes([]);
      return;
    }
    const ac = new AbortController();
    fetchSeismic(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setEarthquakes(data.earthquakes);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Seismic]", e);
      });
    const interval = setInterval(() => {
      fetchSeismic(ac.signal)
        .then((data) => {
          if (!ac.signal.aborted) setEarthquakes(data.earthquakes);
        })
        .catch(() => {});
    }, 300_000);
    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [seismicFilter.enabled]);

  useEffect(() => {
    if (!firesFilter.enabled) {
      setFires([]);
      return;
    }
    const ac = new AbortController();
    fetchFires(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setFires(data.fires);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Fires]", e);
      });
    return () => ac.abort();
  }, [firesFilter.enabled]);

  useEffect(() => {
    if (!gdeltFilter.enabled) {
      setGdeltEvents([]);
      return;
    }
    const ac = new AbortController();
    fetchGdelt(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setGdeltEvents(data.events);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[GDELT]", e);
      });
    const interval = setInterval(() => {
      fetchGdelt(ac.signal)
        .then((data) => {
          if (!ac.signal.aborted) setGdeltEvents(data.events);
        })
        .catch(() => {});
    }, 900_000);
    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [gdeltFilter.enabled]);

  useEffect(() => {
    if (!militaryFilter.enabled) {
      setMilitaryBases([]);
      return;
    }
    const ac = new AbortController();
    fetchMilitaryBases(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setMilitaryBases(data);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Military]", e);
      });
    return () => ac.abort();
  }, [militaryFilter.enabled]);

  useEffect(() => {
    if (!nuclearFilter.enabled) {
      setNuclearSites([]);
      return;
    }
    const ac = new AbortController();
    fetchNuclearSites(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setNuclearSites(data);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Nuclear]", e);
      });
    return () => ac.abort();
  }, [nuclearFilter.enabled]);

  useEffect(() => {
    if (!maritimeFilter.enabled) {
      setVessels([]);
      return;
    }
    const ac = new AbortController();
    fetchMaritime(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setVessels(data.vessels);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Maritime]", e);
      });
    const interval = setInterval(() => {
      fetchMaritime(ac.signal)
        .then((data) => {
          if (!ac.signal.aborted) setVessels(data.vessels);
        })
        .catch(() => {});
    }, 600_000);
    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [maritimeFilter.enabled]);

  useEffect(() => {
    if (!cyberFilter.enabled) {
      setCyberThreats([]);
      return;
    }
    const ac = new AbortController();
    fetchCyber(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setCyberThreats(data.threats);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[Cyber]", e);
      });
    const interval = setInterval(() => {
      fetchCyber(ac.signal)
        .then((data) => {
          if (!ac.signal.aborted) setCyberThreats(data.threats);
        })
        .catch(() => {});
    }, 900_000);
    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [cyberFilter.enabled]);

  useEffect(() => {
    if (!spaceWeatherFilter.enabled) {
      setAurora([]);
      setKpIndex(0);
      setSpaceWeatherAlerts([]);
      return;
    }
    const ac = new AbortController();
    fetchSpaceWeather(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) {
          setAurora(data.aurora);
          setKpIndex(data.kp_index);
          setSpaceWeatherAlerts(data.alerts);
        }
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          console.error("[SpaceWeather]", e);
      });
    const interval = setInterval(() => {
      fetchSpaceWeather(ac.signal)
        .then((data) => {
          if (!ac.signal.aborted) {
            setAurora(data.aurora);
            setKpIndex(data.kp_index);
            setSpaceWeatherAlerts(data.alerts);
          }
        })
        .catch(() => {});
    }, 900_000);
    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [spaceWeatherFilter.enabled]);

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

    cameraFilter,
    setCameraFilter,
    cameras,
    selectedCamera,
    setSelectedCamera,

    weatherFilter,
    setWeatherFilter,
    weatherPoints,
    weatherLoading,
    rainViewerData,

    metarFilter,
    setMetarFilter,
    metarStations,
    selectedMetar,
    setSelectedMetar,

    eventFilter,
    setEventFilter,
    events,
    eventsLoading,
    selectedEvent,
    setSelectedEvent,

    viewportBbox,
    setViewportBbox,
    cameraProgress,

    flyToTarget,
    setFlyToTarget,

    shaderMode,
    setShaderMode,

    cablesFilter,
    setCablesFilter,
    cables,
    landingPoints,
    selectedCable,
    setSelectedCable,

    seismicFilter,
    setSeismicFilter,
    earthquakes,
    selectedEarthquake,
    setSelectedEarthquake,

    firesFilter,
    setFiresFilter,
    fires,
    selectedFire,
    setSelectedFire,

    gdeltFilter,
    setGdeltFilter,
    gdeltEvents,
    selectedGdeltEvent,
    setSelectedGdeltEvent,

    militaryFilter,
    setMilitaryFilter,
    militaryBases,
    selectedMilitaryBase,
    setSelectedMilitaryBase,

    nuclearFilter,
    setNuclearFilter,
    nuclearSites,
    selectedNuclearSite,
    setSelectedNuclearSite,

    maritimeFilter,
    setMaritimeFilter,
    vessels,
    selectedVessel,
    setSelectedVessel,

    cyberFilter,
    setCyberFilter,
    cyberThreats,
    selectedCyberThreat,
    setSelectedCyberThreat,

    spaceWeatherFilter,
    setSpaceWeatherFilter,
    aurora,
    kpIndex,
    spaceWeatherAlerts,

    convergenceZones,

    showSpaceWeatherPopup,
    setShowSpaceWeatherPopup,
  };
}
