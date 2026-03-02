interface SidebarProps {
  children?: React.ReactNode;
  onCollapse?: () => void;
}

export function Sidebar({
  children,
  onCollapse,
}: SidebarProps): React.ReactElement {
  return (
    <div className="fixed inset-y-0 left-0 z-20 flex w-[280px] flex-col border-r border-emerald-900/20 bg-black/92 backdrop-blur-xl panel-grain">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-emerald-900/20 px-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e] animate-pulse" />
          <h1 className="font-mono text-[11px] font-bold uppercase tracking-[0.4em] text-emerald-400 hud-glow">
            SeeYou
          </h1>
          <span className="font-mono text-[7px] text-emerald-900/50 tracking-wider">
            v2.0
          </span>
        </div>
        <button
          onClick={onCollapse}
          className="flex h-6 w-6 items-center justify-center text-emerald-800/40 hover:text-emerald-400 transition-colors"
          aria-label="Collapse sidebar"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 scrollbar-thin">
        <div className="flex flex-col gap-px">{children}</div>
      </div>
    </div>
  );
}
