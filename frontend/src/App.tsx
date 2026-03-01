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

function DebugSection({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="relative">
      <span className="absolute -left-1 -top-1 z-50 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow">
        {n}
      </span>
      {children}
    </div>
  );
}

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
            <DebugSection n={1}>
              <ConnectionStatus status={state.status} />
            </DebugSection>
            <DebugSection n={2}>
              <AircraftCounter
                total={state.totalCount}
                military={state.militaryCount}
                civilian={state.civilianCount}
              />
            </DebugSection>
            <DebugSection n={3}>
              <AircraftFilters
                filter={state.aircraftFilter}
                onFilterChange={state.setAircraftFilter}
              />
            </DebugSection>
            <DebugSection n={4}>
              <SatelliteCounter
                total={state.satelliteTotalCount}
                categoryCounts={state.satelliteCategoryCounts}
              />
            </DebugSection>
            <DebugSection n={5}>
              <SatelliteFilters
                filter={state.satelliteFilter}
                onFilterChange={state.setSatelliteFilter}
              />
            </DebugSection>
            <DebugSection n={6}>
              <TrafficControls
                filter={state.trafficFilter}
                onFilterChange={state.setTrafficFilter}
              />
            </DebugSection>
            <DebugSection n={7}>
              <CameraFilters
                filter={state.cameraFilter}
                cameras={state.cameras}
                onFilterChange={state.setCameraFilter}
              />
            </DebugSection>
          </div>
        </Sidebar>
      )}

      <DebugSection n={8}>
        <ShaderControls
          currentMode={state.shaderMode}
          onModeChange={state.setShaderMode}
        />
      </DebugSection>
      {state.shaderMode === "nightVision" && (
        <DebugSection n={9}>
          <NvgHud />
        </DebugSection>
      )}
      {state.shaderMode === "flir" && (
        <DebugSection n={9}>
          <FlirHud />
        </DebugSection>
      )}
      {state.shaderMode === "crt" && (
        <DebugSection n={9}>
          <CrtHud />
        </DebugSection>
      )}

      <DebugSection n={10}>
        <Minimap viewCenter={null} viewAltitude={0} />
      </DebugSection>
      <DebugSection n={11}>
        <Timeline currentTime={currentTime} isLive={true} />
      </DebugSection>
      <DebugSection n={12}>
        <CursorCoords lat={null} lon={null} altitude={null} />
      </DebugSection>
      <DebugSection n={13}>
        <CameraInfo altitude={0} heading={0} pitch={0} />
      </DebugSection>
      <DebugSection n={14}>
        <AlertSystem aircraft={state.aircraft} satellites={state.satellites} />
      </DebugSection>

      <DebugSection n={15}>
        <SearchBar
          aircraft={state.aircraft}
          satellites={state.satellites}
          cameras={state.cameras}
          onSelectAircraft={state.setSelectedAircraft}
          onSelectSatellite={state.setSelectedSatellite}
          onSelectCamera={state.setSelectedCamera}
        />
      </DebugSection>

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
