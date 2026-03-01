import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WeatherControls } from "./WeatherControls";
import type { WeatherFilter } from "../../types/weather";

afterEach(cleanup);

const baseFilter: WeatherFilter = {
  enabled: false,
  showRadar: true,
  showWind: true,
  radarOpacity: 0.7,
  windOpacity: 0.6,
  animationSpeed: 500,
};

describe("WeatherControls", () => {
  it("renders weather label", () => {
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={() => {}}
        loading={false}
      />,
    );
    expect(screen.getByText("Weather")).toBeInTheDocument();
  });

  it("calls onFilterChange with enabled:true when toggle clicked", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={onChange}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle weather/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("calls onFilterChange with enabled:false when already enabled", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={onChange}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle weather/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows loading state when enabled and loading", () => {
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={() => {}}
        loading={true}
      />,
    );
    expect(screen.getByText("loading…")).toBeInTheDocument();
  });

  it("does not show loading when disabled even if loading prop is true", () => {
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={() => {}}
        loading={true}
      />,
    );
    expect(screen.queryByText("loading…")).not.toBeInTheDocument();
  });

  it("shows sub-toggles for Radar and Wind when enabled", () => {
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={() => {}}
        loading={false}
      />,
    );
    expect(
      screen.getByRole("switch", { name: /toggle radar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /toggle wind/i }),
    ).toBeInTheDocument();
  });

  it("hides sub-toggles when disabled", () => {
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={() => {}}
        loading={false}
      />,
    );
    expect(screen.queryByText("Radar")).not.toBeInTheDocument();
    expect(screen.queryByText("Wind")).not.toBeInTheDocument();
  });

  it("clicking Wind sub-toggle calls onFilterChange with showWind:false", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={onChange}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle wind/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showWind: false }),
    );
  });

  it("clicking Radar sub-toggle calls onFilterChange with showRadar:false", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={onChange}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle radar/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showRadar: false }),
    );
  });

  it("radar opacity slider calls onFilterChange with radarOpacity", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={{
          ...baseFilter,
          enabled: true,
          showRadar: true,
          showWind: true,
        }}
        onFilterChange={onChange}
        loading={false}
      />,
    );
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "0.5" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ radarOpacity: 0.5 }),
    );
  });

  it("animation speed slider appears when radar is enabled", () => {
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true, showRadar: true }}
        onFilterChange={() => {}}
        loading={false}
      />,
    );
    expect(screen.getByText("Speed")).toBeInTheDocument();
  });

  it("animation speed slider hidden when radar is disabled", () => {
    render(
      <WeatherControls
        filter={{
          ...baseFilter,
          enabled: true,
          showRadar: false,
          showWind: true,
        }}
        onFilterChange={() => {}}
        loading={false}
      />,
    );
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
  });
});
