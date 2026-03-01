import type { ConnectionStatus as Status } from "../../types/ws";

interface ConnectionStatusProps {
  status: Status;
}

const CFG = {
  connected: {
    dot: "bg-emerald-400 shadow-[0_0_6px_#34d399]",
    text: "text-emerald-400",
    label: "CONNECTED",
  },
  connecting: {
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-400",
    label: "CONNECTING",
  },
  disconnected: {
    dot: "bg-red-500",
    text: "text-red-400",
    label: "DISCONNECTED",
  },
} as const;

export function ConnectionStatus({
  status,
}: ConnectionStatusProps): React.ReactElement {
  const c = CFG[status];
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-zinc-800/60">
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      <span className={`font-mono text-[10px] tracking-widest ${c.text}`}>
        {c.label}
      </span>
    </div>
  );
}
