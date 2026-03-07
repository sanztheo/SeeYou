import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGraphNavigation } from "./useGraphNavigation";
import { fetchGraphNeighbors, searchGraph } from "../services/graphService";

vi.mock("../services/graphService", () => ({
  fetchGraphNeighbors: vi.fn(),
  searchGraph: vi.fn(),
}));

const mockedFetchGraphNeighbors = vi.mocked(fetchGraphNeighbors);
const mockedSearchGraph = vi.mocked(searchGraph);

describe("useGraphNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads snapshot when focusEntity is called", async () => {
    mockedFetchGraphNeighbors.mockResolvedValue({
      root: { table: "aircraft", id: "abc" },
      nodes: [{ ref: { table: "aircraft", id: "abc" }, label: "AF123" }],
      edges: [],
      truncated: false,
    });

    const { result } = renderHook(() => useGraphNavigation());

    act(() => {
      result.current.focusEntity({ table: "aircraft", id: "abc" });
    });

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(mockedFetchGraphNeighbors).toHaveBeenCalledWith(
      "aircraft",
      "abc",
      1,
      expect.any(AbortSignal),
    );
  });

  it("runs search and supports history back/forward", async () => {
    mockedFetchGraphNeighbors
      .mockResolvedValueOnce({
        root: { table: "aircraft", id: "abc" },
        nodes: [],
        edges: [],
        truncated: false,
      })
      .mockResolvedValueOnce({
        root: { table: "camera", id: "cam-1" },
        nodes: [],
        edges: [],
        truncated: false,
      });

    mockedSearchGraph.mockResolvedValue([
      {
        ref: { table: "camera", id: "cam-1" },
        label: "Paris Cam",
        lat: 48.8,
        lon: 2.3,
      },
    ]);

    const onFlyTo = vi.fn();
    const { result } = renderHook(() => useGraphNavigation({ onFlyTo }));

    act(() => {
      result.current.focusEntity({ table: "aircraft", id: "abc" });
    });

    await waitFor(() => expect(result.current.focus?.id).toBe("abc"));

    act(() => {
      result.current.setSearchQuery("paris");
    });

    await act(async () => {
      await result.current.runSearch();
    });

    expect(result.current.searchResults).toHaveLength(1);

    act(() => {
      result.current.selectSearchResult(result.current.searchResults[0]);
    });

    await waitFor(() => expect(result.current.focus?.id).toBe("cam-1"));
    expect(onFlyTo).toHaveBeenCalledWith(48.8, 2.3);
    expect(result.current.canBack).toBe(true);

    act(() => {
      result.current.goBack();
    });
    await waitFor(() => expect(result.current.focus?.id).toBe("abc"));

    act(() => {
      result.current.goForward();
    });
    await waitFor(() => expect(result.current.focus?.id).toBe("cam-1"));
  });

  it("sets unavailable on 503", async () => {
    mockedFetchGraphNeighbors.mockRejectedValue(new Error("graph neighbors failed: 503"));

    const { result } = renderHook(() => useGraphNavigation());

    act(() => {
      result.current.focusEntity({ table: "aircraft", id: "abc" });
    });

    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.snapshot).toBeNull();
  });
});
