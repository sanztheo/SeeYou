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
  const [sidebarHidden, setSidebarHidden] = useState(false);
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
    onToggleSidebar: useCallback(() => setSidebarHidden((h) => !h), []),
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

  return (
    <div className="relative w-full h-full">
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
        shaderMode={state.shaderMode}
      />

      {!isFullscreen && !sidebarHidden && (
        <Sidebar>
          <div className="space-y-4">
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
          </div>
        </Sidebar>
      )}

      <ShaderControls
        currentMode={state.shaderMode}
        onModeChange={state.setShaderMode}
      />
      {state.shaderMode === "nightVision" && <NvgHud />}
      {state.shaderMode === "flir" && <FlirHud />}
      {state.shaderMode === "crt" && <CrtHud />}

      <Minimap viewCenter={null} viewAltitude={0} />
      <Timeline currentTime={currentTime} isLive={true} />
      <CursorCoords lat={null} lon={null} altitude={null} />
      <CameraInfo altitude={0} heading={0} pitch={0} />
      <AlertSystem aircraft={state.aircraft} satellites={state.satellites} />

      <SearchBar
        aircraft={state.aircraft}
        satellites={state.satellites}
        cameras={state.cameras}
        onSelectAircraft={state.setSelectedAircraft}
        onSelectSatellite={state.setSelectedSatellite}
        onSelectCamera={state.setSelectedCamera}
      />

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
