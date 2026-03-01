import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { EventFilters } from "./EventFilters";
import type { NaturalEvent, EventFilter } from "../../types/events";

afterEach(cleanup);

const baseFilter: EventFilter = {
  enabled: false,
  categories: new Set(),
};

const mockEvents: NaturalEvent[] = [
  {
    id: "1",
    title: "Fire A",
    category: "Wildfires",
    lat: 34,
    lon: -118,
    date: "2026-01-10",
    source_url: null,
  },
  {
    id: "2",
    title: "Fire B",
    category: "Wildfires",
    lat: 35,
    lon: -119,
    date: "2026-01-11",
    source_url: null,
  },
  {
    id: "3",
    title: "Storm C",
    category: "SevereStorms",
    lat: 30,
    lon: -90,
    date: "2026-01-12",
    source_url: null,
  },
];

describe("EventFilters", () => {
  it("renders events label", () => {
    render(
      <EventFilters
        filter={baseFilter}
        events={[]}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("toggle calls onFilterChange with enabled:true", () => {
    const onChange = vi.fn();
    render(
      <EventFilters
        filter={baseFilter}
        events={[]}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /toggle events/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("shows event count when enabled with events", () => {
    render(
      <EventFilters
        filter={{ ...baseFilter, enabled: true }}
        events={mockEvents}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows loading message when enabled with no events", () => {
    render(
      <EventFilters
        filter={{ ...baseFilter, enabled: true }}
        events={[]}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("Loading events…")).toBeInTheDocument();
  });

  it("shows category chips when enabled with events", () => {
    render(
      <EventFilters
        filter={{ ...baseFilter, enabled: true }}
        events={mockEvents}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText(/Wildfires \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Storms \(1\)/)).toBeInTheDocument();
  });

  it("does not render category chip when count is 0", () => {
    render(
      <EventFilters
        filter={{ ...baseFilter, enabled: true }}
        events={mockEvents}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.queryByText(/Volcanoes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Earthquakes/)).not.toBeInTheDocument();
  });

  it("clicking a category chip calls onFilterChange with that category", () => {
    const onChange = vi.fn();
    render(
      <EventFilters
        filter={{ ...baseFilter, enabled: true }}
        events={mockEvents}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText(/Wildfires \(2\)/));
    const call = onChange.mock.calls[0][0] as EventFilter;
    expect(call.categories.has("Wildfires")).toBe(true);
  });

  it("clicking an active category chip removes it from the filter", () => {
    const onChange = vi.fn();
    const filter: EventFilter = {
      enabled: true,
      categories: new Set(["Wildfires"] as const),
    };
    render(
      <EventFilters
        filter={filter}
        events={mockEvents}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText(/Wildfires \(2\)/));
    const call = onChange.mock.calls[0][0] as EventFilter;
    expect(call.categories.has("Wildfires")).toBe(false);
  });

  it("shows filtered count when specific categories are selected", () => {
    const filter: EventFilter = {
      enabled: true,
      categories: new Set(["SevereStorms"] as const),
    };
    render(
      <EventFilters
        filter={filter}
        events={mockEvents}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
