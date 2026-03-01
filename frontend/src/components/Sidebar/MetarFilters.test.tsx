import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MetarFilters } from "./MetarFilters";
import type { MetarStation, MetarFilter } from "../../types/metar";

afterEach(cleanup);

const baseFilter: MetarFilter = {
  enabled: false,
  categories: new Set(),
};

function makeStation(
  id: string,
  cat: string,
  overrides?: Partial<MetarStation>,
): MetarStation {
  return {
    station_id: id,
    lat: 40,
    lon: -74,
    temp_c: 15,
    dewpoint_c: 10,
    wind_dir_deg: 270,
    wind_speed_kt: 10,
    wind_gust_kt: null,
    visibility_m: 9999,
    ceiling_ft: null,
    flight_category: cat,
    raw_metar: `${id} RAW METAR`,
    ...overrides,
  };
}

const mockStations: MetarStation[] = [
  makeStation("KJFK", "VFR"),
  makeStation("KLAX", "VFR"),
  makeStation("KORD", "MVFR"),
  makeStation("KSFO", "IFR"),
  makeStation("KDEN", "LIFR"),
];

describe("MetarFilters", () => {
  it("renders METAR label", () => {
    render(
      <MetarFilters
        filter={baseFilter}
        stations={[]}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("METAR")).toBeInTheDocument();
  });

  it("toggle calls onFilterChange with enabled:true", () => {
    const onChange = vi.fn();
    render(
      <MetarFilters
        filter={baseFilter}
        stations={[]}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle metar/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("shows station count when enabled with stations", () => {
    render(
      <MetarFilters
        filter={{ ...baseFilter, enabled: true }}
        stations={mockStations}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not show station count when disabled", () => {
    render(
      <MetarFilters
        filter={baseFilter}
        stations={mockStations}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("shows all 4 flight category chips when enabled", () => {
    render(
      <MetarFilters
        filter={{ ...baseFilter, enabled: true }}
        stations={mockStations}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("VFR")).toBeInTheDocument();
    expect(screen.getByText("MVFR")).toBeInTheDocument();
    expect(screen.getByText("IFR")).toBeInTheDocument();
    expect(screen.getByText("LIFR")).toBeInTheDocument();
  });

  it("hides category chips when disabled", () => {
    render(
      <MetarFilters
        filter={baseFilter}
        stations={mockStations}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.queryByText("VFR")).not.toBeInTheDocument();
  });

  it("shows per-category counts next to chips", () => {
    render(
      <MetarFilters
        filter={{ ...baseFilter, enabled: true }}
        stations={mockStations}
        onFilterChange={() => {}}
      />,
    );
    const vfrButton = screen.getByText("VFR").closest("button")!;
    expect(vfrButton.textContent).toContain("2");
    const mvfrButton = screen.getByText("MVFR").closest("button")!;
    expect(mvfrButton.textContent).toContain("1");
  });

  it("clicking a category chip calls onFilterChange with that category toggled", () => {
    const onChange = vi.fn();
    render(
      <MetarFilters
        filter={{ ...baseFilter, enabled: true }}
        stations={mockStations}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("VFR").closest("button")!);
    const call = onChange.mock.calls[0][0] as MetarFilter;
    expect(call.categories.has("VFR")).toBe(true);
  });

  it("clicking an active category chip removes it", () => {
    const onChange = vi.fn();
    const filter: MetarFilter = {
      enabled: true,
      categories: new Set(["VFR"] as const),
    };
    render(
      <MetarFilters
        filter={filter}
        stations={mockStations}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("VFR").closest("button")!);
    const call = onChange.mock.calls[0][0] as MetarFilter;
    expect(call.categories.has("VFR")).toBe(false);
  });

  it("each category dot has the correct background color", () => {
    render(
      <MetarFilters
        filter={{ ...baseFilter, enabled: true }}
        stations={mockStations}
        onFilterChange={() => {}}
      />,
    );
    const vfrDot = screen
      .getByText("VFR")
      .closest("button")!
      .querySelector("span.inline-block") as HTMLElement;
    expect(vfrDot.style.backgroundColor).toBe("rgb(34, 197, 94)");
  });
});
