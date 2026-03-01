import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TimelineProps {
  currentTime: Date;
  onTimeChange?: (time: Date) => void;
  isLive: boolean;
  onToggleLive?: () => void;
  sidebarOpen?: boolean;
}

const SPAN_MS = 60 * 60 * 1000;
const TICK_INTERVAL_MS = 10 * 60 * 1000;

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
  sidebarOpen,
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
      result.push({
        pct: ((t - start) / SPAN_MS) * 100,
        label: formatTickUTC(new Date(t)),
      });
    }
    return result;
  }, [displayTime]);

  const handleJump = useCallback(
    (deltaMin: number) => {
      onTimeChange?.(new Date(displayTime.getTime() + deltaMin * 60_000));
    },
    [displayTime, onTimeChange],
  );

  const barRef = useRef<HTMLDivElement>(null);
  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      onTimeChange?.(
        new Date(
          displayTime.getTime() -
            SPAN_MS +
            ((e.clientX - rect.left) / rect.width) * SPAN_MS,
        ),
      );
    },
    [displayTime, onTimeChange],
  );

  const leftMargin = sidebarOpen ? "pl-[280px]" : "pl-0";

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-30 flex h-10 items-center border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl ${leftMargin} transition-all select-none`}
    >
      <div className="flex w-full items-center gap-2 px-3">
        {/* LIVE */}
        <button
          onClick={onToggleLive}
          className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-zinc-800/60 transition-colors"
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" : "bg-zinc-600"}`}
          />
          <span
            className={`font-mono text-[9px] tracking-widest ${isLive ? "text-emerald-400" : "text-zinc-600"}`}
          >
            LIVE
          </span>
        </button>

        {/* Play/Pause */}
        <button
          onClick={onToggleLive}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-emerald-400 transition-colors"
        >
          {isLive ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="3.5" height="10" rx="0.5" />
              <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="2,0 12,6 2,12" />
            </svg>
          )}
        </button>

        {/* Jump */}
        <div className="flex shrink-0 gap-0.5">
          {JUMP_BUTTONS.map((btn) => (
            <button
              key={btn.label}
              onClick={() => handleJump(btn.delta)}
              className="rounded border border-zinc-800/60 px-1.5 py-0.5 font-mono text-[8px] text-zinc-600 transition-colors hover:border-emerald-500/30 hover:text-emerald-400"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Bar */}
        <div
          ref={barRef}
          onClick={handleBarClick}
          className="relative flex-1 h-5 cursor-pointer group"
        >
          <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-zinc-800" />
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex flex-col items-center"
              style={{ left: `${tick.pct}%` }}
            >
              <div className="w-px h-1.5 bg-zinc-700 mt-0.5" />
              <span className="font-mono text-[6px] text-zinc-700 mt-px">
                {tick.label}
              </span>
            </div>
          ))}
          <div className="absolute top-0 bottom-0 right-0 flex flex-col items-center">
            <div className="w-px h-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
          </div>
          <div className="absolute inset-0 rounded bg-emerald-400/0 group-hover:bg-emerald-400/5 transition-colors" />
        </div>

        {/* Clock */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-xs tabular-nums tracking-wider text-emerald-400">
            {formatUTC(displayTime)}
          </div>
          <div className="font-mono text-[7px] tracking-widest text-zinc-600">
            UTC
          </div>
        </div>
      </div>
    </div>
  );
}
