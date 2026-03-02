import { useState, useCallback, useEffect } from "react";
import { Globe } from "./components/Globe/Globe";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ConnectionStatus } from "./components/ConnectionStatus/ConnectionStatus";
import { AircraftCounter } from "./components/Sidebar/AircraftCounter";
import { AircraftFilters } from "./components/Sidebar/AircraftFilters";
import { AircraftPopup } from "./components/Aircraft/AircraftPopup";
import { AircraftTooltip } from "./components/Aircraft/AircraftTooltip";
import { SatelliteCounter } from "./components/Sidebar/SatelliteCounter";
import { SatelliteFilters } from "./components/Sidebar/SatelliteFilters";
import { SatellitePopup } from "./components/Satellite/SatellitePopup";
import { TrafficControls } from "./components/Sidebar/TrafficControls";
import { CameraFilters } from "./components/Sidebar/CameraFilters";
import { WeatherControls } from "./components/Sidebar/WeatherControls";
import { MetarFilters } from "./components/Sidebar/MetarFilters";
import { MetarPopup } from "./components/Aviation/MetarPopup";
import { EventFilters } from "./components/Sidebar/EventFilters";
import { EventPopup } from "./components/Events/EventPopup";
import { IntelligenceFilters } from "./components/Sidebar/IntelligenceFilters";
import { EarthquakePopup } from "./components/Seismic/EarthquakePopup";
import { FirePopup } from "./components/Fires/FirePopup";
import { CablePopup } from "./components/Cables/CablePopup";
import { MilitaryBasePopup } from "./components/Military/MilitaryBasePopup";
import { NuclearSitePopup } from "./components/Nuclear/NuclearSitePopup";
import { VesselPopup } from "./components/Maritime/VesselPopup";
import { CyberThreatPopup } from "./components/Cyber/CyberThreatPopup";
import { GdeltPopup } from "./components/Gdelt/GdeltPopup";
import { SpaceWeatherPopup } from "./components/SpaceWeather/SpaceWeatherPopup";
import { IntelligenceLegend } from "./components/HUD/IntelligenceLegend";
import { CameraPlayer } from "./components/Camera/CameraPlayer";
import { Minimap } from "./components/Minimap/Minimap";
import { Timeline } from "./components/Timeline/Timeline";
import { SearchBar } from "./components/SearchBar/SearchBar";
import { AlertSystem } from "./components/Alerts/AlertSystem";
import { CursorCoords } from "./components/HUD/CursorCoords";
import { CameraInfo } from "./components/HUD/CameraInfo";
import { useAppState } from "./hooks/useAppState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type { CameraState, CursorState } from "./hooks/useViewerCallbacks";

export function App(): React.ReactElement {
  const state = useAppState();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [cameraState, setCameraState] = useState<CameraState>({
    lat: 48.8566,
    lon: 2.3522,
    altitude: 2500,
    heading: 0,
    pitch: -45,
  });
  const [cursorState, setCursorState] = useState<CursorState>({
    lat: null,
    lon: null,
    altitude: null,
  });

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isLive, setIsLive] = useState(true);

  const handleToggleLive = useCallback(() => {
    setIsLive((prev) => {
      const next = !prev;
      if (next) setCurrentTime(new Date());
      return next;
    });
  }, []);

  const handleTimeChange = useCallback((time: Date) => {
    setCurrentTime(time);
    setIsLive(false);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleToggleSidebar = useCallback(() => setSidebarOpen((h) => !h), []);
  const handleCollapseSidebar = useCallback(() => setSidebarOpen(false), []);
  const handleExpandSidebar = useCallback(() => setSidebarOpen(true), []);
  const handleFlyToCity = useCallback(
    (lat: number, lon: number, alt: number) =>
      state.setFlyToTarget({ lat, lon, alt }),
    [state.setFlyToTarget],
  );
  const handleFlyComplete = useCallback(
    () => state.setFlyToTarget(null),
    [state.setFlyToTarget],
  );

  useKeyboardShortcuts({
    onToggleFullscreen: handleToggleFullscreen,
    onToggleSidebar: handleToggleSidebar,
  });

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const handleCloseAircraft = useCallback(
    () => state.setSelectedAircraft(null),
    [state.setSelectedAircraft],
  );
  const handleCloseSatellite = useCallback(
    () => state.setSelectedSatellite(null),
    [state.setSelectedSatellite],
  );
  const handleCloseCamera = useCallback(
    () => state.setSelectedCamera(null),
    [state.setSelectedCamera],
  );
  const handleCloseEvent = useCallback(
    () => state.setSelectedEvent(null),
    [state.setSelectedEvent],
  );
  const handleCloseMetar = useCallback(
    () => state.setSelectedMetar(null),
    [state.setSelectedMetar],
  );
  const handleCloseEarthquake = useCallback(
    () => state.setSelectedEarthquake(null),
    [state.setSelectedEarthquake],
  );
  const handleCloseFire = useCallback(
    () => state.setSelectedFire(null),
    [state.setSelectedFire],
  );
  const handleCloseCable = useCallback(
    () => state.setSelectedCable(null),
    [state.setSelectedCable],
  );
  const handleCloseMilitaryBase = useCallback(
    () => state.setSelectedMilitaryBase(null),
    [state.setSelectedMilitaryBase],
  );
  const handleCloseNuclearSite = useCallback(
    () => state.setSelectedNuclearSite(null),
    [state.setSelectedNuclearSite],
  );
  const handleCloseVessel = useCallback(
    () => state.setSelectedVessel(null),
    [state.setSelectedVessel],
  );
  const handleCloseCyberThreat = useCallback(
    () => state.setSelectedCyberThreat(null),
    [state.setSelectedCyberThreat],
  );
  const handleCloseGdeltEvent = useCallback(
    () => state.setSelectedGdeltEvent(null),
    [state.setSelectedGdeltEvent],
  );
  const handleCloseSpaceWeather = useCallback(
    () => state.setShowSpaceWeatherPopup(false),
    [state.setShowSpaceWeatherPopup],
  );

  const showSidebar = !isFullscreen && sidebarOpen;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black scanline-overlay">
      {/* Globe fills everything */}
      <Globe
        aircraft={state.aircraft}
        filter={state.aircraftFilter}
        trackedIcao={state.selectedAircraft?.icao ?? null}
        onSelectAircraft={state.setSelectedAircraft}
        onHoverAircraft={state.setHoveredAircraft}
        flightRoute={state.flightRoute}
        predictions={state.predictions}
        satellites={state.satellites}
        satelliteFilter={state.satelliteFilter}
        onSelectSatellite={state.setSelectedSatellite}
        trafficFilter={state.trafficFilter}
        onTrafficLoading={state.setTrafficLoadState}
        cameras={state.cameras}
        cameraFilter={state.cameraFilter}
        onSelectCamera={state.setSelectedCamera}
        weatherPoints={state.weatherPoints}
        weatherFilter={state.weatherFilter}
        rainViewerData={state.rainViewerData}
        events={state.events}
        eventFilter={state.eventFilter}
        onSelectEvent={state.setSelectedEvent}
        metarStations={state.metarStations}
        metarFilter={state.metarFilter}
        onSelectMetar={state.setSelectedMetar}
        cables={state.cables}
        landingPoints={state.landingPoints}
        cablesFilter={state.cablesFilter}
        earthquakes={state.earthquakes}
        seismicFilter={state.seismicFilter}
        fires={state.fires}
        firesFilter={state.firesFilter}
        gdeltEvents={state.gdeltEvents}
        gdeltFilter={state.gdeltFilter}
        militaryBases={state.militaryBases}
        militaryFilter={state.militaryFilter}
        nuclearSites={state.nuclearSites}
        nuclearFilter={state.nuclearFilter}
        vessels={state.vessels}
        maritimeFilter={state.maritimeFilter}
        cyberThreats={state.cyberThreats}
        cyberFilter={state.cyberFilter}
        aurora={state.aurora}
        kpIndex={state.kpIndex}
        spaceWeatherFilter={state.spaceWeatherFilter}
        convergenceZones={state.convergenceZones}
        onSelectEarthquake={state.setSelectedEarthquake}
        onSelectFire={state.setSelectedFire}
        onSelectCable={state.setSelectedCable}
        onSelectMilitaryBase={state.setSelectedMilitaryBase}
        onSelectNuclearSite={state.setSelectedNuclearSite}
        onSelectVessel={state.setSelectedVessel}
        onSelectCyberThreat={state.setSelectedCyberThreat}
        onSelectGdeltEvent={state.setSelectedGdeltEvent}
        onViewportChange={state.setViewportBbox}
        onCameraChange={setCameraState}
        onCursorMove={setCursorState}
        flyToTarget={state.flyToTarget}
        onFlyComplete={handleFlyComplete}
      />

      {/* Sidebar */}
      {showSidebar && (
        <Sidebar onCollapse={handleCollapseSidebar}>
          <ConnectionStatus status={state.status} />
          <AircraftCounter
            total={state.totalCount}
            military={state.militaryCount}
            civilian={state.civilianCount}
          />
          <AircraftFilters
            filter={state.aircraftFilter}
            onFilterChange={state.setAircraftFilter}
          />
          <SatelliteCounter
            total={state.satelliteTotalCount}
            categoryCounts={state.satelliteCategoryCounts}
          />
          <SatelliteFilters
            filter={state.satelliteFilter}
            onFilterChange={state.setSatelliteFilter}
          />
          <TrafficControls
            filter={state.trafficFilter}
            onFilterChange={state.setTrafficFilter}
            loading={state.trafficLoading}
            roadCount={state.trafficRoadCount}
            totalRoads={state.trafficTotalRoads}
          />
          <CameraFilters
            filter={state.cameraFilter}
            cameras={state.cameras}
            progress={state.cameraProgress}
            onFilterChange={state.setCameraFilter}
          />
          <WeatherControls
            filter={state.weatherFilter}
            onFilterChange={state.setWeatherFilter}
            loading={state.weatherLoading}
          />
          <MetarFilters
            filter={state.metarFilter}
            stations={state.metarStations}
            onFilterChange={state.setMetarFilter}
          />
          <EventFilters
            filter={state.eventFilter}
            events={state.events}
            onFilterChange={state.setEventFilter}
          />
          <IntelligenceFilters
            cablesFilter={state.cablesFilter}
            onCablesFilterChange={state.setCablesFilter}
            seismicFilter={state.seismicFilter}
            onSeismicFilterChange={state.setSeismicFilter}
            firesFilter={state.firesFilter}
            onFiresFilterChange={state.setFiresFilter}
            gdeltFilter={state.gdeltFilter}
            onGdeltFilterChange={state.setGdeltFilter}
            militaryFilter={state.militaryFilter}
            onMilitaryFilterChange={state.setMilitaryFilter}
            nuclearFilter={state.nuclearFilter}
            onNuclearFilterChange={state.setNuclearFilter}
            maritimeFilter={state.maritimeFilter}
            onMaritimeFilterChange={state.setMaritimeFilter}
            cyberFilter={state.cyberFilter}
            onCyberFilterChange={state.setCyberFilter}
            spaceWeatherFilter={state.spaceWeatherFilter}
            onSpaceWeatherFilterChange={state.setSpaceWeatherFilter}
            earthquakeCount={state.earthquakes.length}
            fireCount={state.fires.length}
            vesselCount={state.vessels.length}
            threatCount={state.cyberThreats.length}
            kpIndex={state.kpIndex}
          />
        </Sidebar>
      )}

      {/* Expand sidebar tab when collapsed */}
      {!isFullscreen && !sidebarOpen && (
        <button
          onClick={handleExpandSidebar}
          className="fixed top-3 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-zinc-400 backdrop-blur-md border border-zinc-700/40 hover:text-zinc-100 hover:border-zinc-500/60 transition-all"
          aria-label="Open sidebar"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Top bar: Search */}
      <SearchBar
        aircraft={state.aircraft}
        satellites={state.satellites}
        cameras={state.cameras}
        militaryBases={state.militaryBases}
        nuclearSites={state.nuclearSites}
        cables={state.cables}
        earthquakes={state.earthquakes}
        vessels={state.vessels}
        onSelectAircraft={state.setSelectedAircraft}
        onSelectSatellite={state.setSelectedSatellite}
        onSelectCamera={state.setSelectedCamera}
        onSelectMilitary={state.setSelectedMilitaryBase}
        onSelectNuclear={state.setSelectedNuclearSite}
        onSelectCable={state.setSelectedCable}
        onSelectEarthquake={state.setSelectedEarthquake}
        onSelectVessel={state.setSelectedVessel}
        onFlyToCity={handleFlyToCity}
        sidebarOpen={showSidebar}
      />

      {/* ═══ RIGHT PANEL: unified detail column ═══ */}
      <div className="fixed top-2 right-2 bottom-12 z-30 flex flex-col gap-1.5 w-[280px] pointer-events-none">
        {/* HUD strip */}
        <div className="pointer-events-auto">
          <CameraInfo
            altitude={cameraState.altitude}
            heading={cameraState.heading}
            pitch={cameraState.pitch}
          />
        </div>

        {/* Alerts */}
        <div className="pointer-events-auto">
          <AlertSystem
            aircraft={state.aircraft}
            satellites={state.satellites}
          />
        </div>

        {/* Scrollable detail popups */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden detail-panel pointer-events-auto flex flex-col gap-1.5">
          {state.selectedAircraft && (
            <AircraftPopup
              aircraft={state.selectedAircraft}
              onClose={handleCloseAircraft}
              flightRoute={state.flightRoute}
              routeLoading={state.routeLoading}
              prediction={
                state.predictions.get(state.selectedAircraft.icao) ?? null
              }
            />
          )}
          {state.selectedSatellite && (
            <SatellitePopup
              satellite={state.selectedSatellite}
              onClose={handleCloseSatellite}
            />
          )}
          {state.selectedEvent && (
            <EventPopup
              event={state.selectedEvent}
              onClose={handleCloseEvent}
            />
          )}
          {state.selectedMetar && (
            <MetarPopup
              station={state.selectedMetar}
              onClose={handleCloseMetar}
            />
          )}
          {state.selectedEarthquake && (
            <EarthquakePopup
              earthquake={state.selectedEarthquake}
              onClose={handleCloseEarthquake}
            />
          )}
          {state.selectedFire && (
            <FirePopup fire={state.selectedFire} onClose={handleCloseFire} />
          )}
          {state.selectedCable && (
            <CablePopup
              cable={state.selectedCable}
              onClose={handleCloseCable}
            />
          )}
          {state.selectedMilitaryBase && (
            <MilitaryBasePopup
              base={state.selectedMilitaryBase}
              onClose={handleCloseMilitaryBase}
            />
          )}
          {state.selectedNuclearSite && (
            <NuclearSitePopup
              site={state.selectedNuclearSite}
              onClose={handleCloseNuclearSite}
            />
          )}
          {state.selectedVessel && (
            <VesselPopup
              vessel={state.selectedVessel}
              onClose={handleCloseVessel}
            />
          )}
          {state.selectedCyberThreat && (
            <CyberThreatPopup
              threat={state.selectedCyberThreat}
              onClose={handleCloseCyberThreat}
            />
          )}
          {state.selectedGdeltEvent && (
            <GdeltPopup
              event={state.selectedGdeltEvent}
              onClose={handleCloseGdeltEvent}
            />
          )}
          <SpaceWeatherPopup
            kpIndex={state.kpIndex}
            alerts={state.spaceWeatherAlerts}
            onClose={handleCloseSpaceWeather}
            visible={state.showSpaceWeatherPopup}
          />
        </div>

        {/* Minimap at bottom of right panel */}
        <div className="pointer-events-none shrink-0">
          <Minimap
            viewCenter={{ lat: cameraState.lat, lon: cameraState.lon }}
            viewAltitude={cameraState.altitude}
          />
        </div>
      </div>

      {/* ═══ BOTTOM LEFT: coords + legend ═══ */}
      <CursorCoords
        lat={cursorState.lat}
        lon={cursorState.lon}
        altitude={cursorState.altitude}
        sidebarOpen={showSidebar}
      />
      <IntelligenceLegend
        cablesFilter={state.cablesFilter}
        cableCount={state.cables.length}
        seismicFilter={state.seismicFilter}
        earthquakeCount={state.earthquakes.length}
        firesFilter={state.firesFilter}
        fireCount={state.fires.length}
        gdeltFilter={state.gdeltFilter}
        gdeltCount={state.gdeltEvents.length}
        militaryFilter={state.militaryFilter}
        militaryCount={state.militaryBases.length}
        nuclearFilter={state.nuclearFilter}
        nuclearCount={state.nuclearSites.length}
        maritimeFilter={state.maritimeFilter}
        vesselCount={state.vessels.length}
        cyberFilter={state.cyberFilter}
        threatCount={state.cyberThreats.length}
        spaceWeatherFilter={state.spaceWeatherFilter}
        kpIndex={state.kpIndex}
        sidebarOpen={showSidebar}
      />

      {/* ═══ BOTTOM BAR: Timeline ═══ */}
      <Timeline
        currentTime={currentTime}
        onTimeChange={handleTimeChange}
        isLive={isLive}
        onToggleLive={handleToggleLive}
        sidebarOpen={showSidebar}
      />

      {/* Floating overlays */}
      <AircraftTooltip
        aircraft={state.hoveredAircraft}
        screenX={state.hoverPos.x}
        screenY={state.hoverPos.y}
      />
      <CameraPlayer camera={state.selectedCamera} onClose={handleCloseCamera} />
    </div>
  );
}
