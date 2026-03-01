interface SidebarProps {
  children?: React.ReactNode;
  onCollapse?: () => void;
}

export function Sidebar({
  children,
  onCollapse,
}: SidebarProps): React.ReactElement {
  return (
    <div className="fixed inset-y-0 left-0 z-20 flex w-[280px] flex-col border-r border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/80 px-4">
        <h1 className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-zinc-200">
          SeeYou
        </h1>
        <button
          onClick={onCollapse}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
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

      {/* Scrollable content — stops above the timeline bar (h-10 = 40px) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 scrollbar-thin">
        <div className="flex flex-col gap-px">{children}</div>
      </div>
    </div>
  );
}
