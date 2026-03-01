interface FlirHudProps {
  range?: number;
  bearing?: number;
}

export function FlirHud({ range, bearing }: FlirHudProps): React.ReactElement {
  const rangeStr = range != null ? `${range.toFixed(1)} km` : "-- km";
  const brgStr = bearing != null ? `${Math.round(bearing)}°` : "---°";

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Temperature scale — left edge */}
      <div className="absolute bottom-20 left-4 top-20 flex flex-col items-center gap-1">
        <span className="font-mono text-[9px] text-white/70">°C</span>
        <div
          className="w-3 flex-1 rounded-sm"
          style={{
            background:
              "linear-gradient(to bottom, #fff, #ffee00, #ff2200, #9900cc, #0000aa, #000)",
          }}
        />
        <div className="flex w-8 justify-between font-mono text-[8px] text-white/60">
          <span>-20</span>
        </div>
        <div className="-mt-1 flex w-8 justify-between font-mono text-[8px] text-white/60">
          <span>+50</span>
        </div>
      </div>

      {/* Top-left label */}
      <div className="absolute left-14 top-4 font-mono text-xs text-white/90">
        <div className="text-sm font-bold tracking-widest">FLIR</div>
        <div className="mt-1 text-[10px] text-white/60">
          RNG {rangeStr} &nbsp; BRG {brgStr}
        </div>
      </div>

      {/* Center targeting reticle */}
      <svg
        className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 96 96"
      >
        <circle
          cx="48"
          cy="48"
          r="22"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1"
        />
        <circle
          cx="48"
          cy="48"
          r="8"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />
        <line
          x1="48"
          y1="10"
          x2="48"
          y2="36"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1"
        />
        <line
          x1="48"
          y1="60"
          x2="48"
          y2="86"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1"
        />
        <line
          x1="10"
          y1="48"
          x2="36"
          y2="48"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1"
        />
        <line
          x1="60"
          y1="48"
          x2="86"
          y2="48"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1"
        />
      </svg>

      {/* Bottom-right FOV */}
      <div className="absolute bottom-4 right-4 font-mono text-[10px] text-white/50">
        FOV 24° &nbsp; WFOV
      </div>
    </div>
  );
}
