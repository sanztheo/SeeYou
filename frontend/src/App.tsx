import { useState, useCallback, useEffect } from "react";
import { Globe } from "./components/Globe/Globe";
import { IconRail, type SectionId } from "./components/Sidebar/IconRail";
import { SidePanel } from "./components/Sidebar/SidePanel";
import { AircraftCounter } from "./components/Sidebar/AircraftCounter";
import { AircraftFilters } from "./components/Sidebar/AircraftFilters";
import { AircraftPopup } from "./components/Aircraft/AircraftPopup";
import { AircraftTooltip } from "./components/Aircraft/AircraftTooltip";
import { SatelliteCounter } from "./components/Sidebar/SatelliteCounter";
import { SatelliteFilters } from "./components/Sidebar/SatelliteFilters";
import { SatellitePopup } from "./components/Satellite/SatellitePopup";
import { TrafficControls } from "./components/Sidebar/TrafficControls";
import { RoutingPanel } from "./components/Sidebar/RoutingPanel";
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
import { DraggablePanel } from "./components/DraggablePanel";
import { useAppState } from "./hooks/useAppState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type { CameraState, CursorState } from "./hooks/useViewerCallbacks";

export function App(): React.ReactElement {
  const state = useAppState();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId | null>(
    "aircraft",
  );

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

  const handleToggleSection = useCallback(
    (id: SectionId) => setActiveSection((prev) => (prev === id ? null : id)),
    [],
  );
  const handleCloseSection = useCallback(() => setActiveSection(null), []);
  const handleToggleSidebar = useCallback(
    () => setActiveSection((prev) => (prev ? null : "aircraft")),
    [],
  );
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
  const handleOpenSpaceWeather = useCallback(
    () => state.setShowSpaceWeatherPopup(true),
    [state.setShowSpaceWeatherPopup],
  );

  const showRail = !isFullscreen;
  const panelOpen = showRail && activeSection !== null;

  const hasDetailPopup =
    state.selectedAircraft ||
    state.selectedSatellite ||
    state.selectedEvent ||
    state.selectedMetar ||
    state.selectedEarthquake ||
    state.selectedFire ||
    state.selectedCable ||
    state.selectedMilitaryBase ||
    state.selectedNuclearSite ||
    state.selectedVessel ||
    state.selectedCyberThreat ||
    state.selectedGdeltEvent ||
    state.showSpaceWeatherPopup;

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

      {/* Icon Rail (always visible unless fullscreen) */}
      {showRail && (
        <IconRail
          activeSection={activeSection}
          onToggle={handleToggleSection}
          status={state.status}
        />
      )}

      {/* Section panels */}
      {panelOpen && activeSection === "aircraft" && (
        <SidePanel title="Aircraft" onClose={handleCloseSection}>
          <AircraftCounter
            total={state.totalCount}
            military={state.militaryCount}
            civilian={state.civilianCount}
          />
          <AircraftFilters
            filter={state.aircraftFilter}
            onFilterChange={state.setAircraftFilter}
          />
        </SidePanel>
      )}
      {panelOpen && activeSection === "satellites" && (
        <SidePanel title="Satellites" onClose={handleCloseSection}>
          <SatelliteCounter
            total={state.satelliteTotalCount}
            categoryCounts={state.satelliteCategoryCounts}
          />
          <SatelliteFilters
            filter={state.satelliteFilter}
            onFilterChange={state.setSatelliteFilter}
          />
        </SidePanel>
      )}
      {panelOpen && activeSection === "traffic" && (
        <SidePanel title="Traffic" onClose={handleCloseSection}>
          <TrafficControls
            filter={state.trafficFilter}
            onFilterChange={state.setTrafficFilter}
          />
          {state.trafficFilter.enabled && <RoutingPanel />}
        </SidePanel>
      )}
      {panelOpen && activeSection === "cameras" && (
        <SidePanel title="Cameras" onClose={handleCloseSection}>
          <CameraFilters
            filter={state.cameraFilter}
            cameras={state.cameras}
            progress={state.cameraProgress}
            onFilterChange={state.setCameraFilter}
            onSelect={state.setSelectedCamera}
          />
        </SidePanel>
      )}
      {panelOpen && activeSection === "weather" && (
        <SidePanel title="Weather" onClose={handleCloseSection}>
          <WeatherControls
            filter={state.weatherFilter}
            onFilterChange={state.setWeatherFilter}
            loading={state.weatherLoading}
          />
        </SidePanel>
      )}
      {panelOpen && activeSection === "metar" && (
        <SidePanel title="METAR" onClose={handleCloseSection}>
          <MetarFilters
            filter={state.metarFilter}
            stations={state.metarStations}
            onFilterChange={state.setMetarFilter}
          />
        </SidePanel>
      )}
      {panelOpen && activeSection === "events" && (
        <SidePanel title="Events" onClose={handleCloseSection}>
          <EventFilters
            filter={state.eventFilter}
            events={state.events}
            onFilterChange={state.setEventFilter}
          />
        </SidePanel>
      )}
      {panelOpen && activeSection === "intel" && (
        <SidePanel title="Intelligence" onClose={handleCloseSection}>
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
        </SidePanel>
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
        sidebarOpen={panelOpen}
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

        {/* Scrollable detail popups — each is draggable */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden detail-panel flex flex-col gap-1.5 ${hasDetailPopup ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          {state.selectedAircraft && (
            <DraggablePanel>
              <AircraftPopup
                aircraft={state.selectedAircraft}
                onClose={handleCloseAircraft}
                flightRoute={state.flightRoute}
                routeLoading={state.routeLoading}
                prediction={
                  state.predictions.get(state.selectedAircraft.icao) ?? null
                }
              />
            </DraggablePanel>
          )}
          {state.selectedSatellite && (
            <DraggablePanel>
              <SatellitePopup
                satellite={state.selectedSatellite}
                onClose={handleCloseSatellite}
              />
            </DraggablePanel>
          )}
          {state.selectedEvent && (
            <DraggablePanel>
              <EventPopup
                event={state.selectedEvent}
                onClose={handleCloseEvent}
              />
            </DraggablePanel>
          )}
          {state.selectedMetar && (
            <DraggablePanel>
              <MetarPopup
                station={state.selectedMetar}
                onClose={handleCloseMetar}
              />
            </DraggablePanel>
          )}
          {state.selectedEarthquake && (
            <DraggablePanel>
              <EarthquakePopup
                earthquake={state.selectedEarthquake}
                onClose={handleCloseEarthquake}
              />
            </DraggablePanel>
          )}
          {state.selectedFire && (
            <DraggablePanel>
              <FirePopup fire={state.selectedFire} onClose={handleCloseFire} />
            </DraggablePanel>
          )}
          {state.selectedCable && (
            <DraggablePanel>
              <CablePopup
                cable={state.selectedCable}
                onClose={handleCloseCable}
              />
            </DraggablePanel>
          )}
          {state.selectedMilitaryBase && (
            <DraggablePanel>
              <MilitaryBasePopup
                base={state.selectedMilitaryBase}
                onClose={handleCloseMilitaryBase}
              />
            </DraggablePanel>
          )}
          {state.selectedNuclearSite && (
            <DraggablePanel>
              <NuclearSitePopup
                site={state.selectedNuclearSite}
                onClose={handleCloseNuclearSite}
              />
            </DraggablePanel>
          )}
          {state.selectedVessel && (
            <DraggablePanel>
              <VesselPopup
                vessel={state.selectedVessel}
                onClose={handleCloseVessel}
              />
            </DraggablePanel>
          )}
          {state.selectedCyberThreat && (
            <DraggablePanel>
              <CyberThreatPopup
                threat={state.selectedCyberThreat}
                onClose={handleCloseCyberThreat}
              />
            </DraggablePanel>
          )}
          {state.selectedGdeltEvent && (
            <DraggablePanel>
              <GdeltPopup
                event={state.selectedGdeltEvent}
                onClose={handleCloseGdeltEvent}
              />
            </DraggablePanel>
          )}
          {state.showSpaceWeatherPopup && (
            <DraggablePanel>
              <SpaceWeatherPopup
                kpIndex={state.kpIndex}
                alerts={state.spaceWeatherAlerts}
                onClose={handleCloseSpaceWeather}
                visible={state.showSpaceWeatherPopup}
              />
            </DraggablePanel>
          )}
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
        sidebarOpen={panelOpen}
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
        alertCount={state.spaceWeatherAlerts.length}
        sidebarOpen={panelOpen}
        onClickSpaceWeather={handleOpenSpaceWeather}
      />

      {/* ═══ BOTTOM BAR: Timeline ═══ */}
      <Timeline
        currentTime={currentTime}
        onTimeChange={handleTimeChange}
        isLive={isLive}
        onToggleLive={handleToggleLive}
        sidebarOpen={panelOpen}
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
