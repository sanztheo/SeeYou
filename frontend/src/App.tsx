import { Globe } from "./components/Globe/Globe";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ConnectionStatus } from "./components/ConnectionStatus/ConnectionStatus";
import { useWebSocket } from "./hooks/useWebSocket";

export function App(): React.ReactElement {
  const { status } = useWebSocket();

  return (
    <div className="relative w-full h-full">
      <Globe />
      <Sidebar>
        <div className="space-y-4">
          <ConnectionStatus status={status} />
          <p className="text-xs text-gray-500">
            Phase 1 — Geospatial Surveillance Simulator
          </p>
        </div>
      </Sidebar>
    </div>
  );
}
