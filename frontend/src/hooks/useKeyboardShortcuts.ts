import { useEffect, useRef } from "react";

interface KeyboardShortcutOptions {
  onToggleFullscreen?: () => void;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = e.target;
      if (
        tag instanceof HTMLInputElement ||
        tag instanceof HTMLTextAreaElement
      ) {
        if (e.key === "Escape") {
          (tag as HTMLElement).blur();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        optionsRef.current.onSearch?.();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "f":
        case "F":
          optionsRef.current.onToggleFullscreen?.();
          break;
        case "/":
          e.preventDefault();
          optionsRef.current.onSearch?.();
          break;
        case "b":
        case "B":
          optionsRef.current.onToggleSidebar?.();
          break;
        case "Escape":
          optionsRef.current.onEscape?.();
          break;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
