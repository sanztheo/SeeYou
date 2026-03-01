import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function fireKey(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
  target?: EventTarget,
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    ...opts,
  });
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  window.dispatchEvent(event);
}

describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fullscreen shortcut", () => {
    it("triggers on 'f' key", () => {
      const onToggleFullscreen = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleFullscreen }));

      fireKey("f");

      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    });

    it("triggers on 'F' key", () => {
      const onToggleFullscreen = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleFullscreen }));

      fireKey("F");

      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    });
  });

  describe("sidebar shortcut", () => {
    it("triggers on 'b' key", () => {
      const onToggleSidebar = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleSidebar }));

      fireKey("b");

      expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    });
  });

  describe("search shortcut", () => {
    it("triggers on Ctrl+K", () => {
      const onSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSearch }));

      fireKey("k", { ctrlKey: true });

      expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it("triggers on Cmd+K (Mac)", () => {
      const onSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSearch }));

      fireKey("k", { metaKey: true });

      expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it("triggers on '/' key", () => {
      const onSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSearch }));

      fireKey("/");

      expect(onSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe("escape shortcut", () => {
    it("triggers onEscape", () => {
      const onEscape = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onEscape }));

      fireKey("Escape");

      expect(onEscape).toHaveBeenCalledTimes(1);
    });
  });

  describe("modifier key suppression", () => {
    it("ignores 'f' when Meta is held", () => {
      const onToggleFullscreen = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleFullscreen }));

      fireKey("f", { metaKey: true });

      expect(onToggleFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("input field suppression", () => {
    it("ignores shortcuts when target is an input", () => {
      const onToggleFullscreen = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleFullscreen }));

      const input = document.createElement("input");
      fireKey("f", {}, input);

      expect(onToggleFullscreen).not.toHaveBeenCalled();
    });

    it("ignores shortcuts when target is a textarea", () => {
      const onToggleSidebar = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleSidebar }));

      const textarea = document.createElement("textarea");
      fireKey("b", {}, textarea);

      expect(onToggleSidebar).not.toHaveBeenCalled();
    });

    it("blurs input on Escape", () => {
      const onEscape = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onEscape }));

      const input = document.createElement("input");
      input.blur = vi.fn();
      fireKey("Escape", {}, input);

      expect(input.blur).toHaveBeenCalled();
      expect(onEscape).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes listener on unmount", () => {
      const onToggleFullscreen = vi.fn();
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts({ onToggleFullscreen }),
      );

      unmount();
      fireKey("f");

      expect(onToggleFullscreen).not.toHaveBeenCalled();
    });
  });
});
