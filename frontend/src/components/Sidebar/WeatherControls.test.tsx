import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WeatherControls } from "./WeatherControls";
import type { WeatherFilter } from "../../types/weather";

afterEach(cleanup);

const baseFilter: WeatherFilter = {
  enabled: false,
  showWind: true,
  showTemperature: true,
  showClouds: true,
};

describe("WeatherControls", () => {
  it("renders weather label", () => {
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={() => {}}
        pointCount={0}
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
        pointCount={0}
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
        pointCount={0}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle weather/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows point count when enabled and points > 0", () => {
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={() => {}}
        pointCount={1250}
        loading={false}
      />,
    );
    expect(screen.getByText(/1,250 pts/)).toBeInTheDocument();
  });

  it("does not show point count when disabled", () => {
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={() => {}}
        pointCount={40}
        loading={false}
      />,
    );
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });

  it("shows loading state when enabled and loading", () => {
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={() => {}}
        pointCount={0}
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
        pointCount={0}
        loading={true}
      />,
    );
    expect(screen.queryByText("loading…")).not.toBeInTheDocument();
  });

  it("shows sub-toggles for Wind and Temperature when enabled", () => {
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={() => {}}
        pointCount={0}
        loading={false}
      />,
    );
    expect(screen.getByText("Wind")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
  });

  it("hides sub-toggles when disabled", () => {
    render(
      <WeatherControls
        filter={baseFilter}
        onFilterChange={() => {}}
        pointCount={0}
        loading={false}
      />,
    );
    expect(screen.queryByText("Wind")).not.toBeInTheDocument();
    expect(screen.queryByText("Temperature")).not.toBeInTheDocument();
  });

  it("clicking Wind sub-toggle calls onFilterChange with showWind:false", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={onChange}
        pointCount={0}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle wind/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showWind: false }),
    );
  });

  it("clicking Temperature sub-toggle calls onFilterChange with showTemperature:false", () => {
    const onChange = vi.fn();
    render(
      <WeatherControls
        filter={{ ...baseFilter, enabled: true }}
        onFilterChange={onChange}
        pointCount={0}
        loading={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("switch", { name: /toggle temperature/i }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showTemperature: false }),
    );
  });
});
