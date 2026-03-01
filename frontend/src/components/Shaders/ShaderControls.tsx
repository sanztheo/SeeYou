import { useEffect } from "react";
import { SHADER_CONFIGS, type ShaderMode } from "../../shaders/types";

interface ShaderControlsProps {
  currentMode: ShaderMode;
  onModeChange: (mode: ShaderMode) => void;
}

export function ShaderControls({
  currentMode,
  onModeChange,
}: ShaderControlsProps): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const cfg = SHADER_CONFIGS.find((c) => c.shortcut === e.key);
      if (cfg) onModeChange(cfg.mode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onModeChange]);

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-zinc-700/60 bg-black/75 px-2 py-1.5 shadow-2xl backdrop-blur-md">
      {SHADER_CONFIGS.map((cfg) => {
        const active = cfg.mode === currentMode;
        return (
          <button
            key={cfg.mode}
            onClick={() => onModeChange(cfg.mode)}
            title={cfg.description}
            className={`
              group relative flex items-center gap-2 rounded-md px-3 py-1.5
              font-mono text-[11px] uppercase tracking-wider transition-all
              ${
                active
                  ? "bg-emerald-950/60 text-emerald-400 shadow-inner shadow-emerald-900/40"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
              }
            `}
          >
            <kbd
              className={`
                inline-flex h-5 w-5 items-center justify-center rounded border text-[10px]
                ${
                  active
                    ? "border-emerald-700/50 text-emerald-400"
                    : "border-zinc-700 text-zinc-600 group-hover:text-zinc-400"
                }
              `}
            >
              {cfg.shortcut}
            </kbd>
            <span>{cfg.label}</span>
            {active && (
              <span className="absolute -top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            )}
          </button>
        );
      })}
    </div>
  );
}
