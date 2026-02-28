import type { ConnectionStatus as Status } from "../../types/ws";

interface ConnectionStatusProps {
  status: Status;
}

const STATUS_CONFIG = {
  connected: { color: "bg-green-500", label: "Connected" },
  connecting: { color: "bg-yellow-500", label: "Connecting..." },
  disconnected: { color: "bg-red-500", label: "Disconnected" },
} as const;

export function ConnectionStatus({
  status,
}: ConnectionStatusProps): React.ReactElement {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800/80 text-xs text-gray-300">
      <span
        className={`w-2 h-2 rounded-full ${config.color} ${status === "connecting" ? "animate-pulse" : ""}`}
      />
      <span>{config.label}</span>
    </div>
  );
}
