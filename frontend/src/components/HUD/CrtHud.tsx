import { useEffect, useState } from "react";

export function CrtHud(): React.ReactElement {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = time.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const timeStr = time.toLocaleTimeString("en-US", { hour12: false });

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Faint full-screen scanline overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,1) 1px, rgba(0,0,0,1) 2px)",
        }}
      />

      {/* REC indicator — blinking */}
      <div className="absolute right-5 top-4 flex items-center gap-2 font-mono text-sm text-red-500">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
        REC
      </div>

      {/* Channel */}
      <div className="absolute right-5 top-12 font-mono text-lg font-bold text-white/80">
        CH-03
      </div>

      {/* PLAY indicator */}
      <div className="absolute left-5 top-4 font-mono text-xs text-white/60">
        PLAY ▶
      </div>

      {/* VHS date/time stamp */}
      <div className="absolute bottom-4 left-5 font-mono text-sm text-white/75">
        <span className="mr-3">{dateStr}</span>
        <span>{timeStr}</span>
      </div>

      {/* Tracking counter */}
      <div className="absolute bottom-4 right-5 font-mono text-[10px] text-white/40">
        SP &nbsp; LP &nbsp; 02:14:37
      </div>
    </div>
  );
}
