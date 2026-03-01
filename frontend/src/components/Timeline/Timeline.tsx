import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TimelineProps {
  currentTime: Date;
  onTimeChange?: (time: Date) => void;
  isLive: boolean;
  onToggleLive?: () => void;
}

const SPAN_MS = 60 * 60 * 1000; // 60 minutes
const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatUTC(d: Date) {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function formatTickUTC(d: Date) {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

const JUMP_BUTTONS = [
  { label: "-5m", delta: -5 },
  { label: "-1m", delta: -1 },
  { label: "+1m", delta: 1 },
  { label: "+5m", delta: 5 },
] as const;

export function Timeline({
  currentTime,
  onTimeChange,
  isLive,
  onToggleLive,
}: TimelineProps) {
  const [displayTime, setDisplayTime] = useState(currentTime);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isLive) {
      setDisplayTime(currentTime);
      return;
    }
    let running = true;
    const tick = () => {
      if (!running) return;
      setDisplayTime(new Date());
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [isLive, currentTime]);

  const ticks = useMemo(() => {
    const now = displayTime.getTime();
    const start = now - SPAN_MS;
    const firstTick = Math.ceil(start / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
    const result: { pct: number; label: string }[] = [];
    for (let t = firstTick; t <= now; t += TICK_INTERVAL_MS) {
      const pct = ((t - start) / SPAN_MS) * 100;
      result.push({ pct, label: formatTickUTC(new Date(t)) });
    }
    return result;
  }, [displayTime]);

  const handleJump = useCallback(
    (deltaMin: number) => {
      const next = new Date(displayTime.getTime() + deltaMin * 60_000);
      onTimeChange?.(next);
    },
    [displayTime, onTimeChange],
  );

  const barRef = useRef<HTMLDivElement>(null);

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const now = displayTime.getTime();
      const clickedTime = new Date(now - SPAN_MS + pct * SPAN_MS);
      onTimeChange?.(clickedTime);
    },
    [displayTime, onTimeChange],
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-12 bg-gray-900/90 backdrop-blur-sm border-t border-gray-700/50 flex items-center px-4 gap-3 select-none">
      {/* LIVE indicator */}
      <button
        onClick={onToggleLive}
        className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded hover:bg-gray-800/60 transition-colors"
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isLive
              ? "bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse"
              : "bg-gray-500"
          }`}
        />
        <span
          className={`font-mono text-[10px] tracking-widest ${
            isLive ? "text-green-400" : "text-gray-500"
          }`}
        >
          LIVE
        </span>
      </button>

      {/* Play / Pause */}
      <button
        onClick={onToggleLive}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-800/60 transition-colors text-gray-400 hover:text-green-400"
      >
        {isLive ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="1" width="3.5" height="10" rx="0.5" />
            <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <polygon points="2,0 12,6 2,12" />
          </svg>
        )}
      </button>

      {/* Jump buttons */}
      <div className="flex gap-1 shrink-0">
        {JUMP_BUTTONS.map((btn) => (
          <button
            key={btn.label}
            onClick={() => handleJump(btn.delta)}
            className="px-1.5 py-0.5 text-[9px] font-mono text-gray-500 hover:text-green-400 border border-gray-700/50 rounded hover:border-green-500/40 transition-colors"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="flex-1 relative h-6 cursor-pointer group"
      >
        {/* track */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-gray-700/60" />

        {/* tick marks */}
        {ticks.map((tick, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${tick.pct}%` }}
          >
            <div className="w-px h-2 bg-gray-600 mt-1" />
            <span className="text-[7px] font-mono text-gray-600 mt-0.5">
              {tick.label}
            </span>
          </div>
        ))}

        {/* cursor */}
        <div className="absolute top-0 bottom-0 right-0 flex flex-col items-center">
          <div className="w-0.5 h-full bg-green-400 shadow-[0_0_4px_#4ade80]" />
        </div>

        {/* hover highlight */}
        <div className="absolute inset-0 rounded bg-green-400/0 group-hover:bg-green-400/5 transition-colors" />
      </div>

      {/* UTC clock */}
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm text-green-400 tabular-nums tracking-wider">
          {formatUTC(displayTime)}
        </div>
        <div className="font-mono text-[8px] text-gray-500 tracking-widest">
          UTC
        </div>
      </div>
    </div>
  );
}
