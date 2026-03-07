import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GraphView } from "./GraphView";
import type { UseGraphNavigationResult } from "../../hooks/useGraphNavigation";

function baseNavigation(): UseGraphNavigationResult {
  return {
    focus: { table: "aircraft", id: "abc" },
    snapshot: { root: { table: "aircraft", id: "abc" }, nodes: [], edges: [], truncated: false },
    loading: false,
    unavailable: false,
    error: null,
    depth: 1,
    setDepth: vi.fn(),
    canBack: false,
    canForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
    focusEntity: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    searchResults: [],
    searching: false,
    runSearch: vi.fn(),
    selectSearchResult: vi.fn(),
    reload: vi.fn(),
  };
}

describe("GraphView", () => {
  it("renders empty state when snapshot has no nodes", () => {
    const nav = baseNavigation();
    render(<GraphView navigation={nav} onSelectNode={vi.fn()} />);

    expect(screen.getByText("No neighbors found.")).toBeTruthy();
  });

  it("renders unavailable and error states", () => {
    const navUnavailable = { ...baseNavigation(), unavailable: true };
    const { rerender } = render(
      <GraphView navigation={navUnavailable} onSelectNode={vi.fn()} />,
    );

    expect(screen.getByText(/Graph backend unavailable/)).toBeTruthy();

    const navError = { ...baseNavigation(), error: "boom" };
    rerender(<GraphView navigation={navError} onSelectNode={vi.fn()} />);

    expect(screen.getByText("boom")).toBeTruthy();
  });


  it("renders graph nodes and forwards selection", () => {
    const nav = {
      ...baseNavigation(),
      snapshot: {
        root: { table: "aircraft", id: "abc" },
        nodes: [
          {
            ref: { table: "satellite", id: "25544" },
            label: "ISS",
            subtitle: "Low Earth Orbit",
          },
        ],
        edges: [],
        truncated: false,
      },
    };
    const onSelectNode = vi.fn();

    render(<GraphView navigation={nav} onSelectNode={onSelectNode} />);

    expect(screen.getByText("ISS")).toBeTruthy();
    expect(screen.getByText("satellite")).toBeTruthy();
    expect(screen.getByText("◌")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /ISS/i }));
    expect(onSelectNode).toHaveBeenCalledWith(nav.snapshot.nodes[0]);
  });

  it("triggers search and depth actions", () => {
    const nav = baseNavigation();
    render(<GraphView navigation={nav} onSelectNode={vi.fn()} />);

    fireEvent.click(screen.getByText("Depth 2"));
    expect(nav.setDepth).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByText("Go"));
    expect(nav.runSearch).toHaveBeenCalled();
  });
});
