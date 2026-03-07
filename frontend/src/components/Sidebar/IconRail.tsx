import type { ConnectionStatus as Status } from "../../types/ws";

export type SectionId =
  | "aircraft"
  | "satellites"
  | "traffic"
  | "cameras"
  | "weather"
  | "metar"
  | "events"
  | "intel"
  | "graph";

interface IconRailProps {
  activeSection: SectionId | null;
  onToggle: (id: SectionId) => void;
  status: Status;
}

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const STATUS_DOT: Record<Status, string> = {
  connected: "bg-emerald-500 shadow-[0_0_6px_#22c55e]",
  connecting: "bg-amber-400 animate-pulse",
  disconnected: "bg-red-500",
};

const SECTIONS: SectionDef[] = [
  {
    id: "aircraft",
    label: "AIR",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    ),
  },
  {
    id: "satellites",
    label: "SAT",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 2a1 1 0 011 1v2.07A8.002 8.002 0 0119.93 12H22a1 1 0 110 2h-2.07A8.002 8.002 0 0113 20.93V23a1 1 0 11-2 0v-2.07A8.002 8.002 0 014.07 14H2a1 1 0 110-2h2.07A8.002 8.002 0 0111 5.07V3a1 1 0 011-1zm0 5a5 5 0 100 10 5 5 0 000-10z" />
      </svg>
    ),
  },
  {
    id: "traffic",
    label: "TFC",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
      </svg>
    ),
  },
  {
    id: "cameras",
    label: "CAM",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
    ),
  },
  {
    id: "weather",
    label: "WX",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
      </svg>
    ),
  },
  {
    id: "metar",
    label: "MET",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3c0-1.23.76-2.28 1.83-2.73L10.33 4h3.34l-.17 10.27A2.99 2.99 0 0114.5 17z" />
        <path d="M12 1a1 1 0 011 1v1h-2V2a1 1 0 011-1z" />
      </svg>
    ),
  },
  {
    id: "events",
    label: "EVT",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm1-5C6.47 2 2 6.5 2 12a10 10 0 0010 10 10 10 0 0010-10A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16z" />
      </svg>
    ),
  },
  {
    id: "intel",
    label: "INT",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
      </svg>
    ),
  },
  {
    id: "graph",
    label: "REL",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M7 4a3 3 0 013 3c0 .27-.03.54-.1.79l3.26 1.86A3 3 0 0118 12c0 .27-.03.54-.1.79l2.04 1.17A3 3 0 1120 16l-2.04-1.17A3 3 0 0112 13a3 3 0 01-1.17-2.04L7.57 9.1A3 3 0 117 4zm0 2a1 1 0 100 2 1 1 0 000-2zm11 5a1 1 0 100 2 1 1 0 000-2zm-6 1a1 1 0 100 2 1 1 0 000-2zm8 5a1 1 0 100 2 1 1 0 000-2z" />
      </svg>
    ),
  },
];

export function IconRail({ activeSection, onToggle, status }: IconRailProps) {
  return (
    <div className="fixed inset-y-0 left-0 z-30 flex w-[44px] flex-col items-center border-r border-emerald-900/20 bg-black/95 backdrop-blur-xl py-2 gap-1">
      {/* Logo + status */}
      <div className="flex flex-col items-center gap-1 mb-2">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        <span className="font-mono text-[7px] tracking-[0.3em] text-emerald-600/60 uppercase">
          SY
        </span>
      </div>

      <div className="w-6 h-px bg-emerald-900/30 mb-1" />

      {/* Section buttons */}
      {SECTIONS.map((sec) => {
        const isActive = activeSection === sec.id;
        return (
          <button
            key={sec.id}
            onClick={() => onToggle(sec.id)}
            className={`group relative flex flex-col items-center justify-center w-9 h-9 transition-all ${
              isActive
                ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30"
                : "text-emerald-800/50 hover:text-emerald-500/80 hover:bg-emerald-900/10 border border-transparent"
            }`}
            title={sec.label}
          >
            {sec.icon}
            <span className="text-[6px] font-mono tracking-widest mt-0.5 opacity-70">
              {sec.label}
            </span>
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-emerald-400 shadow-[0_0_4px_#22c55e]" />
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      {/* Version */}
      <span className="font-mono text-[6px] text-emerald-900/40 tracking-wider">
        v2.0
      </span>
    </div>
  );
}
