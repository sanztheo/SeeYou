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
    <div className="fixed bottom-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-zinc-800/60 bg-zinc-950/70 p-1 shadow-lg shadow-black/30 backdrop-blur-xl">
      {SHADER_CONFIGS.map((cfg) => {
        const active = cfg.mode === currentMode;
        return (
          <button
            key={cfg.mode}
            onClick={() => onModeChange(cfg.mode)}
            title={cfg.description}
            className={`relative flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
              active
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-400"
            }`}
          >
            <kbd
              className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[9px] ${
                active
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-zinc-700/50 text-zinc-700"
              }`}
            >
              {cfg.shortcut}
            </kbd>
            <span className="hidden sm:inline">{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}
