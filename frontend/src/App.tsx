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

export function App(): React.ReactElement {
  const state = useAppState();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime] = useState(() => new Date());

  useKeyboardShortcuts({
    onShaderChange: state.setShaderMode,
    onToggleFullscreen: useCallback(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    }, []),
    onToggleSidebar: useCallback(() => setSidebarOpen((h) => !h), []),
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
        roads={state.roads}
        cameras={state.cameras}
        cameraFilter={state.cameraFilter}
        onSelectCamera={state.setSelectedCamera}
        onViewportChange={state.setViewportBbox}
        shaderMode={state.shaderMode}
      />

      {/* Sidebar */}
      {showSidebar && (
        <Sidebar onCollapse={() => setSidebarOpen(false)}>
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
          />
          <CameraFilters
            filter={state.cameraFilter}
            cameras={state.cameras}
            onFilterChange={state.setCameraFilter}
          />
        </Sidebar>
      )}

      {/* Expand sidebar tab when collapsed */}
      {!isFullscreen && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
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

      {/* Top bar: Search + Camera info */}
      <SearchBar
        aircraft={state.aircraft}
        satellites={state.satellites}
        cameras={state.cameras}
        onSelectAircraft={state.setSelectedAircraft}
        onSelectSatellite={state.setSelectedSatellite}
        onSelectCamera={state.setSelectedCamera}
        sidebarOpen={showSidebar}
      />
      <CameraInfo altitude={0} heading={0} pitch={0} />

      {/* Right side: Alerts */}
      <AlertSystem aircraft={state.aircraft} satellites={state.satellites} />

      {/* Shader HUDs (fullscreen overlays) */}
      {state.shaderMode === "nightVision" && <NvgHud />}
      {state.shaderMode === "flir" && <FlirHud />}
      {state.shaderMode === "crt" && <CrtHud />}

      {/* Bottom zone: above timeline */}
      <CursorCoords
        lat={null}
        lon={null}
        altitude={null}
        sidebarOpen={showSidebar}
      />
      <Minimap viewCenter={null} viewAltitude={0} />
      <ShaderControls
        currentMode={state.shaderMode}
        onModeChange={state.setShaderMode}
      />

      {/* Bottom bar: Timeline */}
      <Timeline
        currentTime={currentTime}
        isLive={true}
        sidebarOpen={showSidebar}
      />

      {/* Popups & Tooltips (highest z) */}
      <AircraftTooltip
        aircraft={state.hoveredAircraft}
        screenX={state.hoverPos.x}
        screenY={state.hoverPos.y}
      />
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
      <SatellitePopup
        satellite={state.selectedSatellite}
        onClose={handleCloseSatellite}
      />
      <CameraPlayer camera={state.selectedCamera} onClose={handleCloseCamera} />
    </div>
  );
}
