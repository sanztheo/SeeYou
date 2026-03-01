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

  describe("shader shortcuts", () => {
    it.each([
      ["1", "normal"],
      ["2", "nightVision"],
      ["3", "flir"],
      ["4", "crt"],
      ["5", "anime"],
    ] as const)("key '%s' triggers shader mode '%s'", (key, mode) => {
      const onShaderChange = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShaderChange }));

      fireKey(key);

      expect(onShaderChange).toHaveBeenCalledWith(mode);
    });

    it("does not trigger shader change for unmapped key", () => {
      const onShaderChange = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShaderChange }));

      fireKey("6");
      fireKey("0");
      fireKey("a");

      expect(onShaderChange).not.toHaveBeenCalled();
    });
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
    it("ignores shader keys when Ctrl is held", () => {
      const onShaderChange = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShaderChange }));

      fireKey("2", { ctrlKey: true });

      expect(onShaderChange).not.toHaveBeenCalled();
    });

    it("ignores shader keys when Alt is held", () => {
      const onShaderChange = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShaderChange }));

      fireKey("3", { altKey: true });

      expect(onShaderChange).not.toHaveBeenCalled();
    });

    it("ignores 'f' when Meta is held", () => {
      const onToggleFullscreen = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleFullscreen }));

      fireKey("f", { metaKey: true });

      expect(onToggleFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("input field suppression", () => {
    it("ignores shortcuts when target is an input", () => {
      const onShaderChange = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShaderChange }));

      const input = document.createElement("input");
      fireKey("2", {}, input);

      expect(onShaderChange).not.toHaveBeenCalled();
    });

    it("ignores shortcuts when target is a textarea", () => {
      const onShaderChange = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShaderChange }));

      const textarea = document.createElement("textarea");
      fireKey("3", {}, textarea);

      expect(onShaderChange).not.toHaveBeenCalled();
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
      const onShaderChange = vi.fn();
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts({ onShaderChange }),
      );

      unmount();
      fireKey("2");

      expect(onShaderChange).not.toHaveBeenCalled();
    });
  });

  describe("callback ref updates", () => {
    it("uses latest callback without re-subscribing", () => {
      const spy = vi.spyOn(window, "addEventListener");
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      const { rerender } = renderHook(
        ({ cb }) => useKeyboardShortcuts({ onShaderChange: cb }),
        { initialProps: { cb: cb1 } },
      );

      const addCount = spy.mock.calls.filter((c) => c[0] === "keydown").length;

      rerender({ cb: cb2 });

      const addCount2 = spy.mock.calls.filter((c) => c[0] === "keydown").length;
      expect(addCount2).toBe(addCount);

      fireKey("2");

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledWith("nightVision");

      spy.mockRestore();
    });
  });
});
