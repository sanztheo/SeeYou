import { useEffect, useRef, useCallback, useState } from "react";
import { Viewer as ResiumViewer } from "resium";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  ClockStep,
  createOsmBuildingsAsync,
  UrlTemplateImageryProvider,
} from "cesium";
import { hasValidToken } from "../../lib/cesium-config";
import { AircraftLayer } from "../Aircraft/AircraftLayer";
import { SatelliteLayer } from "../Satellite/SatelliteLayer";
import { TrafficLayer } from "../Traffic/TrafficLayer";
import { CameraLayer } from "../Camera/CameraLayer";
import { CityLabelsLayer } from "../City/CityLabelsLayer";
import { WeatherLayer } from "../Weather/WeatherLayer";
import { WindParticleLayer } from "../Weather/WindParticleLayer";
import { TemperatureLayer } from "../Weather/TemperatureLayer";
import { AirQualityLayer } from "../Weather/AirQualityLayer";
import { EventLayer } from "../Events/EventLayer";
import { MetarLayer } from "../Aviation/MetarLayer";
import { SubmarineCableLayer } from "../Cables/SubmarineCableLayer";
import { SeismicLayer } from "../Seismic/SeismicLayer";
import { FireLayer } from "../Fires/FireLayer";
import { GdeltLayer } from "../Gdelt/GdeltLayer";
import { MilitaryBasesLayer } from "../Military/MilitaryBasesLayer";
import { NuclearSitesLayer } from "../Nuclear/NuclearSitesLayer";
import { MaritimeLayer } from "../Maritime/MaritimeLayer";
import { CyberThreatLayer } from "../Cyber/CyberThreatLayer";
import { SpaceWeatherLayer } from "../SpaceWeather/SpaceWeatherLayer";
import { ConvergenceAlertLayer } from "../Convergence/ConvergenceAlertLayer";
import { useViewerCallbacks } from "../../hooks/useViewerCallbacks";
import type { CameraState, CursorState } from "../../hooks/useViewerCallbacks";
import type {
  AircraftPosition,
  AircraftFilter,
  FlightRoute,
  PredictedTrajectory,
} from "../../types/aircraft";
import type { SatellitePosition, SatelliteFilter } from "../../types/satellite";
import { DEFAULT_SATELLITE_FILTER } from "../../types/satellite";
import type { TrafficFilter } from "../../types/traffic";
import type { Camera, CameraFilter } from "../../types/camera";
import type {
  WeatherPoint,
  WeatherFilter,
  RainViewerData,
} from "../../types/weather";
import type { NaturalEvent, EventFilter } from "../../types/events";
import type { MetarStation, MetarFilter } from "../../types/metar";
import type { BBox } from "../../services/cameraService";
import type {
  SubmarineCable,
  LandingPoint,
  CablesFilter,
} from "../../types/cables";
import type { Earthquake, SeismicFilter } from "../../types/seismic";
import type { FireHotspot, FiresFilter } from "../../types/fires";
import type { GdeltEvent, GdeltFilter } from "../../types/gdelt";
import type { MilitaryBase, MilitaryFilter } from "../../types/military";
import type { NuclearSite, NuclearFilter } from "../../types/nuclear";
import type { Vessel, MaritimeFilter } from "../../types/maritime";
import type { CyberThreat, CyberFilter } from "../../types/cyber";
import type { AuroraPoint, SpaceWeatherFilter } from "../../types/spaceWeather";
import type { ConvergenceZone } from "../Convergence/ConvergenceAlertLayer";

const RAD2DEG = 180 / Math.PI;
const EMPTY_PREDICTIONS = new Map<string, PredictedTrajectory>();
const NOOP_SELECT_CAMERA = () => {};
const VIEWPORT_THROTTLE_MS = 120;

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
  onTrafficLoading?: (loading: boolean, count: number, total: number) => void;

  cameras?: Camera[];
  cameraFilter?: CameraFilter;
  onSelectCamera?: (cam: Camera) => void;

  weatherPoints?: WeatherPoint[];
  weatherFilter?: WeatherFilter;
  rainViewerData?: RainViewerData | null;

  events?: NaturalEvent[];
  eventFilter?: EventFilter;
  onSelectEvent?: (event: NaturalEvent) => void;

  metarStations?: MetarStation[];
  metarFilter?: MetarFilter;
  onSelectMetar?: (station: MetarStation) => void;

  // Intelligence layers
  cables?: SubmarineCable[];
  landingPoints?: LandingPoint[];
  cablesFilter?: CablesFilter;
  onSelectCable?: (cable: SubmarineCable) => void;

  earthquakes?: Earthquake[];
  seismicFilter?: SeismicFilter;
  onSelectEarthquake?: (eq: Earthquake) => void;

  fires?: FireHotspot[];
  firesFilter?: FiresFilter;
  onSelectFire?: (fire: FireHotspot) => void;

  gdeltEvents?: GdeltEvent[];
  gdeltFilter?: GdeltFilter;
  onSelectGdeltEvent?: (evt: GdeltEvent) => void;

  militaryBases?: MilitaryBase[];
  militaryFilter?: MilitaryFilter;
  onSelectMilitaryBase?: (base: MilitaryBase) => void;

  nuclearSites?: NuclearSite[];
  nuclearFilter?: NuclearFilter;
  onSelectNuclearSite?: (site: NuclearSite) => void;

  vessels?: Vessel[];
  maritimeFilter?: MaritimeFilter;
  onSelectVessel?: (vessel: Vessel) => void;

  cyberThreats?: CyberThreat[];
  cyberFilter?: CyberFilter;
  onSelectCyberThreat?: (threat: CyberThreat) => void;

  aurora?: AuroraPoint[];
  kpIndex?: number;
  spaceWeatherFilter?: SpaceWeatherFilter;

  convergenceZones?: ConvergenceZone[];

  onViewportChange?: (bbox: BBox) => void;

  onCameraChange?: (state: CameraState) => void;
  onCursorMove?: (state: CursorState) => void;

  flyToTarget?: { lat: number; lon: number; alt: number } | null;
  onFlyComplete?: () => void;
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
  onTrafficLoading,
  cameras,
  cameraFilter,
  onSelectCamera,
  weatherPoints,
  weatherFilter,
  rainViewerData,
  events,
  eventFilter,
  onSelectEvent,
  metarStations,
  metarFilter,
  onSelectMetar,
  cables,
  landingPoints,
  cablesFilter,
  onSelectCable,
  earthquakes,
  seismicFilter,
  onSelectEarthquake,
  fires,
  firesFilter,
  onSelectFire,
  gdeltEvents,
  gdeltFilter,
  onSelectGdeltEvent,
  militaryBases,
  militaryFilter,
  onSelectMilitaryBase,
  nuclearSites,
  nuclearFilter,
  onSelectNuclearSite,
  vessels,
  maritimeFilter,
  onSelectVessel,
  cyberThreats,
  cyberFilter,
  onSelectCyberThreat,
  aurora,
  kpIndex,
  spaceWeatherFilter,
  convergenceZones,
  onViewportChange,
  onCameraChange,
  onCursorMove,
  flyToTarget,
  onFlyComplete,
}: GlobeProps): React.ReactElement {
  const viewerRef = useRef<ViewerRef>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  const [viewerReady, setViewerReady] = useState<Viewer | null>(null);
  const lastViewportEmit = useRef(0);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const emitViewport = useCallback((viewer: Viewer): void => {
    const now = performance.now();
    if (now - lastViewportEmit.current < VIEWPORT_THROTTLE_MS) return;
    lastViewportEmit.current = now;

    const rect = viewer.camera.computeViewRectangle();
    if (!rect) return;
    onViewportChangeRef.current?.({
      south: rect.south * RAD2DEG,
      west: rect.west * RAD2DEG,
      north: rect.north * RAD2DEG,
      east: rect.east * RAD2DEG,
    });
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
    viewer.clock.shouldAnimate = true;

    if (!hasValidToken()) {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          credit: "Esri, Maxar, Earthstar Geographics",
        }),
      );
    }

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

    setViewerReady(viewer);

    viewer.camera.percentageChanged = 0.05;
    const onChanged = () => {
      if (!viewer.isDestroyed()) emitViewport(viewer);
    };
    viewer.camera.changed.addEventListener(onChanged);
    emitViewport(viewer);

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(onChanged);
      }
    };
  }, [emitViewport]);

  useEffect(() => {
    if (!flyToTarget) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    const flyCompleteRef = onFlyComplete;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        flyToTarget.lon,
        flyToTarget.lat,
        flyToTarget.alt,
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
      duration: 1.5,
      complete: () => flyCompleteRef?.(),
      cancel: () => flyCompleteRef?.(),
    });
  }, [flyToTarget, onFlyComplete]);

  useViewerCallbacks(viewerReady, onCameraChange, onCursorMove);

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
          predictions={predictions ?? EMPTY_PREDICTIONS}
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
        <TrafficLayer
          filter={trafficFilter}
          onLoadingChange={onTrafficLoading}
        />
      )}

      {cameraFilter?.enabled && cameras && (
        <CameraLayer
          cameras={cameras}
          filter={cameraFilter}
          onSelect={onSelectCamera ?? NOOP_SELECT_CAMERA}
        />
      )}

      {weatherFilter?.enabled && (
        <>
          {weatherFilter.showRadar && (
            <WeatherLayer
              rainViewerData={rainViewerData ?? null}
              filter={weatherFilter}
            />
          )}
          {weatherFilter.showWind &&
            weatherPoints &&
            weatherPoints.length > 0 && (
              <WindParticleLayer
                points={weatherPoints}
                opacity={weatherFilter.windOpacity}
              />
            )}
          {weatherFilter.showTemperature && (
            <TemperatureLayer opacity={weatherFilter.temperatureOpacity} />
          )}
          {weatherFilter.showAirQuality && (
            <AirQualityLayer opacity={weatherFilter.airQualityOpacity} />
          )}
        </>
      )}

      {eventFilter?.enabled && events && events.length > 0 && (
        <EventLayer
          events={events}
          filter={eventFilter}
          onSelect={onSelectEvent}
        />
      )}

      {metarFilter?.enabled && metarStations && metarStations.length > 0 && (
        <MetarLayer
          stations={metarStations}
          filter={metarFilter}
          onSelect={onSelectMetar}
        />
      )}

      {cablesFilter?.enabled && cables && cables.length > 0 && (
        <SubmarineCableLayer
          cables={cables}
          landingPoints={landingPoints ?? []}
          filter={cablesFilter}
          onSelect={onSelectCable}
        />
      )}

      {seismicFilter?.enabled && earthquakes && earthquakes.length > 0 && (
        <SeismicLayer
          earthquakes={earthquakes}
          filter={seismicFilter}
          onSelect={onSelectEarthquake}
        />
      )}

      {firesFilter?.enabled && fires && fires.length > 0 && (
        <FireLayer fires={fires} filter={firesFilter} onSelect={onSelectFire} />
      )}

      {gdeltFilter?.enabled && gdeltEvents && gdeltEvents.length > 0 && (
        <GdeltLayer
          events={gdeltEvents}
          filter={gdeltFilter}
          onSelect={onSelectGdeltEvent}
        />
      )}

      {militaryFilter?.enabled && militaryBases && militaryBases.length > 0 && (
        <MilitaryBasesLayer
          bases={militaryBases}
          filter={militaryFilter}
          onSelect={onSelectMilitaryBase}
        />
      )}

      {nuclearFilter?.enabled && nuclearSites && nuclearSites.length > 0 && (
        <NuclearSitesLayer
          sites={nuclearSites}
          filter={nuclearFilter}
          onSelect={onSelectNuclearSite}
        />
      )}

      {maritimeFilter?.enabled && vessels && vessels.length > 0 && (
        <MaritimeLayer
          vessels={vessels}
          filter={maritimeFilter}
          onSelect={onSelectVessel}
        />
      )}

      {cyberFilter?.enabled && cyberThreats && cyberThreats.length > 0 && (
        <CyberThreatLayer
          threats={cyberThreats}
          filter={cyberFilter}
          onSelect={onSelectCyberThreat}
        />
      )}

      {spaceWeatherFilter?.enabled && aurora && aurora.length > 0 && (
        <SpaceWeatherLayer
          aurora={aurora}
          kpIndex={kpIndex ?? 0}
          filter={spaceWeatherFilter}
        />
      )}

      {convergenceZones && convergenceZones.length > 0 && (
        <ConvergenceAlertLayer zones={convergenceZones} enabled={true} />
      )}

      <CityLabelsLayer />
    </ResiumViewer>
  );
}
