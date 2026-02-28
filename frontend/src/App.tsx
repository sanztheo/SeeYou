import { useState, useCallback } from "react";
import { Globe } from "./components/Globe/Globe";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ConnectionStatus } from "./components/ConnectionStatus/ConnectionStatus";
import { AircraftCounter } from "./components/Sidebar/AircraftCounter";
import { AircraftFilters } from "./components/Sidebar/AircraftFilters";
import { AircraftPopup } from "./components/Aircraft/AircraftPopup";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAircraftStore } from "./hooks/useAircraftStore";
import type { AircraftPosition, AircraftFilter } from "./types/aircraft";
import type { WsMessage } from "./types/ws";

export function App(): React.ReactElement {
  const {
    aircraft,
    update,
    ingestBatch,
    totalCount,
    militaryCount,
    civilianCount,
  } = useAircraftStore();
  const [filter, setFilter] = useState<AircraftFilter>({
    showCivilian: true,
    showMilitary: true,
  });
  const [selectedAircraft, setSelectedAircraft] =
    useState<AircraftPosition | null>(null);

  const handleWsMessage = useCallback(
    (msg: WsMessage): void => {
      if (msg.type === "AircraftUpdate") {
        console.log(
          `[WS] AircraftUpdate: ${msg.payload.aircraft.length} aircraft`,
        );
        update(msg.payload.aircraft);
      } else if (msg.type === "AircraftBatch") {
        const { aircraft: batch, chunk_index, total_chunks } = msg.payload;
        console.log(
          `[WS] AircraftBatch chunk ${chunk_index + 1}/${total_chunks}: ${batch.length} aircraft`,
        );
        ingestBatch(batch, chunk_index, total_chunks);
      }
    },
    [update, ingestBatch],
  );

  const { status } = useWebSocket({ onMessage: handleWsMessage });

  const handleClosePopup = useCallback((): void => {
    setSelectedAircraft(null);
  }, []);

  return (
    <div className="relative w-full h-full">
      <Globe
        aircraft={aircraft}
        filter={filter}
        trackedIcao={selectedAircraft?.icao ?? null}
        onSelectAircraft={setSelectedAircraft}
      />
      <Sidebar>
        <div className="space-y-4">
          <ConnectionStatus status={status} />
          <AircraftCounter
            total={totalCount}
            military={militaryCount}
            civilian={civilianCount}
          />
          <AircraftFilters filter={filter} onFilterChange={setFilter} />
        </div>
      </Sidebar>
      <AircraftPopup aircraft={selectedAircraft} onClose={handleClosePopup} />
    </div>
  );
}
