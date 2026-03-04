import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BasemapControls } from "./BasemapControls";
import type { BasemapStyle } from "../../types/basemap";

describe("BasemapControls", () => {
  it("renders all style choices", () => {
    render(
      <BasemapControls currentStyle="satellite" onStyleChange={() => {}} />,
    );

    expect(screen.getByText("Basemap")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /satellite realistic/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /dark tactical/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /light streets/i }),
    ).toBeInTheDocument();
  });

  it("sets aria-pressed=true on the active style", () => {
    render(
      <BasemapControls currentStyle="dark" onStyleChange={() => {}} />,
    );

    expect(
      screen.getByRole("button", { name: /dark tactical/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /satellite realistic/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onStyleChange when user clicks a different style", () => {
    const onStyleChange = vi.fn<(style: BasemapStyle) => void>();
    render(
      <BasemapControls
        currentStyle="satellite"
        onStyleChange={onStyleChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dark tactical/i }));
    expect(onStyleChange).toHaveBeenCalledWith("dark");
  });
});
