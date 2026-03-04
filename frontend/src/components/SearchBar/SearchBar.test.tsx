import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SearchBar } from "./SearchBar";

vi.mock("../../services/geocodeService", () => ({
  geocodeSearch: vi.fn(),
  geocodeFlyToAltitude: vi.fn((placeType: string) =>
    placeType === "house" ? 1200 : 50000,
  ),
}));

import {
  geocodeSearch,
  geocodeFlyToAltitude,
} from "../../services/geocodeService";

describe("SearchBar address search", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows address-oriented placeholder", () => {
    render(
      <SearchBar
        aircraft={new Map()}
        satellites={new Map()}
        cameras={[]}
        sidebarOpen={false}
      />,
    );

    expect(
      screen.getByPlaceholderText(/address|adresse|place|lieu/i),
    ).toBeInTheDocument();
  });

  it("flies closer when selecting an address result", async () => {
    const onFlyToCity = vi.fn();
    vi.mocked(geocodeSearch).mockResolvedValueOnce([
      {
        name: "10 Downing Street",
        display_name: "10 Downing Street, London, United Kingdom",
        lat: 51.5034,
        lon: -0.1276,
        place_type: "house",
      },
    ]);

    render(
      <SearchBar
        aircraft={new Map()}
        satellites={new Map()}
        cameras={[]}
        sidebarOpen={false}
        onFlyToCity={onFlyToCity}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(/address|adresse|place|lieu/i),
      { target: { value: "10 downing street" } },
    );

    await waitFor(
      () => {
        expect(screen.getByText("10 Downing Street")).toBeInTheDocument();
      },
      { timeout: 1500 },
    );

    fireEvent.click(screen.getByText("10 Downing Street"));

    expect(geocodeFlyToAltitude).toHaveBeenCalledWith("house");
    expect(onFlyToCity).toHaveBeenCalledWith(51.5034, -0.1276, 1200);
  });
});
