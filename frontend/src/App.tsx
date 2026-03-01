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
import { CameraPlayer } from "./components/Camera/CameraPlayer";
import { ShaderControls } from "./components/Shaders/ShaderControls";
import { NvgHud } from "./components/HUD/NvgHud";
import { FlirHud } from "./components/HUD/FlirHud";
import { CrtHud } from "./components/HUD/CrtHud";
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
    onShaderChange: state.setShaderMode,
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

  const showSidebar = !isFullscreen && sidebarOpen;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
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
        onViewportChange={state.setViewportBbox}
        onCameraChange={setCameraState}
        onCursorMove={setCursorState}
        flyToTarget={state.flyToTarget}
        onFlyComplete={handleFlyComplete}
        shaderMode={state.shaderMode}
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
        onSelectAircraft={state.setSelectedAircraft}
        onSelectSatellite={state.setSelectedSatellite}
        onSelectCamera={state.setSelectedCamera}
        onFlyToCity={handleFlyToCity}
        sidebarOpen={showSidebar}
      />

      {/* Right column: CameraInfo → Alerts → Active popup */}
      <div className="fixed top-3 right-3 z-30 flex flex-col items-end gap-2 pointer-events-none max-h-[calc(100vh-5rem)] overflow-y-auto overflow-x-hidden scrollbar-none">
        <div className="pointer-events-auto">
          <CameraInfo
            altitude={cameraState.altitude}
            heading={cameraState.heading}
            pitch={cameraState.pitch}
          />
        </div>
        <div className="pointer-events-auto">
          <AlertSystem
            aircraft={state.aircraft}
            satellites={state.satellites}
          />
        </div>
        <div className="pointer-events-auto">
          <AircraftPopup
            aircraft={state.selectedAircraft}
            onClose={handleCloseAircraft}
            flightRoute={state.flightRoute}
            routeLoading={state.routeLoading}
            prediction={
              state.selectedAircraft
                ? (state.predictions.get(state.selectedAircraft.icao) ?? null)
                : null
            }
          />
        </div>
        <div className="pointer-events-auto">
          <SatellitePopup
            satellite={state.selectedSatellite}
            onClose={handleCloseSatellite}
          />
        </div>
      </div>

      {/* Shader HUDs (fullscreen overlays) */}
      {state.shaderMode === "nightVision" && (
        <NvgHud
          lat={cursorState.lat ?? cameraState.lat}
          lon={cursorState.lon ?? cameraState.lon}
          alt={cameraState.altitude}
        />
      )}
      {state.shaderMode === "flir" && (
        <FlirHud
          range={cameraState.altitude / 1000}
          bearing={cameraState.heading}
        />
      )}
      {state.shaderMode === "crt" && <CrtHud />}

      {/* Bottom zone: above timeline */}
      <CursorCoords
        lat={cursorState.lat}
        lon={cursorState.lon}
        altitude={cursorState.altitude}
        sidebarOpen={showSidebar}
      />
      <Minimap
        viewCenter={{ lat: cameraState.lat, lon: cameraState.lon }}
        viewAltitude={cameraState.altitude}
      />
      <ShaderControls
        currentMode={state.shaderMode}
        onModeChange={state.setShaderMode}
      />

      {/* Bottom bar: Timeline */}
      <Timeline
        currentTime={currentTime}
        onTimeChange={handleTimeChange}
        isLive={isLive}
        onToggleLive={handleToggleLive}
        sidebarOpen={showSidebar}
      />

      {/* Tooltips & remaining popups */}
      <AircraftTooltip
        aircraft={state.hoveredAircraft}
        screenX={state.hoverPos.x}
        screenY={state.hoverPos.y}
      />
      <CameraPlayer camera={state.selectedCamera} onClose={handleCloseCamera} />
      <EventPopup event={state.selectedEvent} onClose={handleCloseEvent} />
      <MetarPopup station={state.selectedMetar} onClose={handleCloseMetar} />
    </div>
  );
}
