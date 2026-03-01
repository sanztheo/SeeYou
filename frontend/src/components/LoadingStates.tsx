import { useEffect, useState } from "react";

interface LayerLoadingProps {
  label: string;
  isLoading: boolean;
  count?: number;
  error?: string | null;
}

export function LayerLoading({
  label,
  isLoading,
  count,
  error,
}: LayerLoadingProps): React.ReactElement | null {
  if (!isLoading && !error) return null;

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded bg-red-950/40 px-2 py-1 font-mono text-[11px] text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="uppercase tracking-wider">{label}</span>
        <span className="truncate text-red-500/80">— {error}</span>
      </div>
    );
  }

  if (!isLoading && count != null) {
    return (
      <div className="flex items-center gap-2 rounded bg-emerald-950/30 px-2 py-1 font-mono text-[11px] text-emerald-400/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="uppercase tracking-wider">{label}</span>
        <span className="tabular-nums text-emerald-500/60">[{count}]</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded bg-zinc-800/60 px-2 py-1 font-mono text-[11px] text-zinc-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      <span className="uppercase tracking-wider">{label}</span>
      <span className="text-zinc-600">LOADING...</span>
    </div>
  );
}

export function GlobalLoadingOverlay({
  message,
}: {
  message: string;
}): React.ReactElement {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,0,0.015)_2px,rgba(0,255,0,0.015)_4px)]" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-900 border-t-emerald-400" />
        <p className="font-mono text-sm uppercase tracking-[0.25em] text-emerald-500">
          {message}
          {dots}
        </p>
        <div className="h-px w-48 bg-gradient-to-r from-transparent via-emerald-800 to-transparent" />
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-900">
          SeeYou Surveillance System
        </p>
      </div>
    </div>
  );
}
