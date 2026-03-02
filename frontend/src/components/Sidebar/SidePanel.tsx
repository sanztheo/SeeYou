interface SidePanelProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function SidePanel({ title, children, onClose }: SidePanelProps) {
  return (
    <div className="fixed top-0 bottom-10 left-[44px] z-20 flex w-[260px] flex-col border-r border-emerald-900/20 bg-black/92 backdrop-blur-xl panel-grain animate-slide-in">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-emerald-900/20 px-3">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-emerald-500/80">
          {title}
        </span>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center text-emerald-800/40 hover:text-emerald-400 transition-colors"
          aria-label="Close panel"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className="flex flex-col gap-px p-1">{children}</div>
      </div>
    </div>
  );
}
