import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ShaderControls } from "./ShaderControls";

afterEach(cleanup);

describe("ShaderControls", () => {
  it("renders all 5 shader mode buttons", () => {
    const { container } = render(
      <ShaderControls currentMode="normal" onModeChange={vi.fn()} />,
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(5);
  });

  it("highlights the active mode button", () => {
    const { container } = render(
      <ShaderControls currentMode="nightVision" onModeChange={vi.fn()} />,
    );

    const buttons = container.querySelectorAll("button");
    const nvButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Night Vision"),
    );
    expect(nvButton?.className).toContain("emerald");
  });

  it("calls onModeChange when a button is clicked", () => {
    const onModeChange = vi.fn();
    const { container } = render(
      <ShaderControls currentMode="normal" onModeChange={onModeChange} />,
    );

    const buttons = container.querySelectorAll("button");
    const flirButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("FLIR"),
    );
    fireEvent.click(flirButton!);

    expect(onModeChange).toHaveBeenCalledWith("flir");
  });

  it("calls onModeChange with correct mode for each button", () => {
    const onModeChange = vi.fn();
    const { container } = render(
      <ShaderControls currentMode="normal" onModeChange={onModeChange} />,
    );

    const buttons = container.querySelectorAll("button");
    const expectedModes = ["normal", "nightVision", "flir", "crt", "anime"];

    buttons.forEach((btn, i) => {
      fireEvent.click(btn);
      expect(onModeChange).toHaveBeenNthCalledWith(i + 1, expectedModes[i]);
    });
  });

  it("displays keyboard shortcut keys 1-5", () => {
    const { container } = render(
      <ShaderControls currentMode="normal" onModeChange={vi.fn()} />,
    );

    const kbds = container.querySelectorAll("kbd");
    const keys = Array.from(kbds).map((k) => k.textContent);
    expect(keys).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("does NOT register any window keydown listener", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    render(<ShaderControls currentMode="normal" onModeChange={vi.fn()} />);

    const keydownCalls = addSpy.mock.calls.filter(
      (call) => call[0] === "keydown",
    );
    expect(keydownCalls.length).toBe(0);

    addSpy.mockRestore();
  });

  it("does not call onModeChange on keyboard press (no listener)", () => {
    const onModeChange = vi.fn();
    render(<ShaderControls currentMode="normal" onModeChange={onModeChange} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "2", bubbles: true }),
    );

    expect(onModeChange).not.toHaveBeenCalled();
  });
});
