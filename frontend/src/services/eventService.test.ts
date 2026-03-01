import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/constants", () => ({
  API_URL: "http://test-api",
}));

describe("eventService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fetches events from API", async () => {
    const mockData = {
      events: [
        {
          id: "EONET_123",
          title: "Wildfire",
          category: "Wildfires",
          lat: 37.8,
          lon: -120.5,
          date: "2026-01-01",
          source_url: null,
        },
      ],
      fetched_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }),
    );

    const { fetchEvents } = await import("./eventService");
    const result = await fetchEvents();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].category).toBe("Wildfires");
    expect(fetch).toHaveBeenCalledWith(
      "http://test-api/events",
      expect.anything(),
    );
  });

  it("throws on non-ok response with status code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const { fetchEvents } = await import("./eventService");
    await expect(fetchEvents()).rejects.toThrow("500");
  });

  it("passes abort signal to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [], fetched_at: "" }),
      }),
    );
    const controller = new AbortController();
    const { fetchEvents } = await import("./eventService");
    await fetchEvents(controller.signal);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("returns empty events array when API returns none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ events: [], fetched_at: "2026-01-01T00:00:00Z" }),
      }),
    );
    const { fetchEvents } = await import("./eventService");
    const result = await fetchEvents();
    expect(result.events).toEqual([]);
    expect(result.fetched_at).toBe("2026-01-01T00:00:00Z");
  });
});
