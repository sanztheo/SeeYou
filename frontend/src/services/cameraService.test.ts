import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BBox } from "./cameraService";

vi.mock("../lib/constants", () => ({
  API_URL: "http://test-api",
}));

function bbox(south: number, west: number, north: number, east: number): BBox {
  return { south, west, north, east };
}

describe("isWorldViewBbox", () => {
  it("flags a bbox wider than 90 degrees of longitude as world view", async () => {
    const { isWorldViewBbox } = await import("./cameraService");
    expect(isWorldViewBbox(bbox(-10, -60, 10, 60))).toBe(true);
  });

  it("does not flag a regional bbox", async () => {
    const { isWorldViewBbox } = await import("./cameraService");
    expect(isWorldViewBbox(bbox(40, -5, 52, 10))).toBe(false);
  });
});

describe("resolveCameraBbox", () => {
  it("uses the current bbox when it is valid and not world-view", async () => {
    const { resolveCameraBbox } = await import("./cameraService");
    const current = bbox(40, -5, 52, 10);
    expect(resolveCameraBbox(current, undefined)).toBe(current);
  });

  it("falls back to the last valid bbox when computeViewRectangle returns undefined (tilted/zoomed-out view)", async () => {
    const { resolveCameraBbox } = await import("./cameraService");
    const lastValid = bbox(40, -5, 52, 10);
    expect(resolveCameraBbox(null, lastValid)).toBe(lastValid);
  });

  it("returns undefined when there is no current bbox and no last valid bbox yet", async () => {
    const { resolveCameraBbox } = await import("./cameraService");
    expect(resolveCameraBbox(null, undefined)).toBeUndefined();
  });

  it("treats a world-view bbox the same as undefined and falls back to the last valid bbox", async () => {
    const { resolveCameraBbox } = await import("./cameraService");
    const lastValid = bbox(40, -5, 52, 10);
    const worldView = bbox(-80, -170, 80, 170);
    expect(resolveCameraBbox(worldView, lastValid)).toBe(lastValid);
  });

  it("does not let a world-view bbox clobber the last valid bbox across calls", async () => {
    const { resolveCameraBbox } = await import("./cameraService");
    // Mirrors the useAppState wiring: `ref.current = resolveCameraBbox(current, ref.current)`.
    let lastValid: BBox | undefined = bbox(40, -5, 52, 10);
    const worldView = bbox(-80, -170, 80, 170);
    lastValid = resolveCameraBbox(worldView, lastValid);
    expect(lastValid).toEqual(bbox(40, -5, 52, 10));
  });
});

describe("fetchCamerasChunked", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends bbox query params when a bbox is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cameras: [], total: 0 }),
      }),
    );
    const { fetchCamerasChunked } = await import("./cameraService");

    await fetchCamerasChunked(bbox(40, -5, 52, 10), () => {});

    const calledUrl = new URL(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
    );
    expect(calledUrl.searchParams.get("south")).toBe("40");
    expect(calledUrl.searchParams.get("west")).toBe("-5");
    expect(calledUrl.searchParams.get("north")).toBe("52");
    expect(calledUrl.searchParams.get("east")).toBe("10");
  });

  it("omits bbox query params when no bbox is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cameras: [], total: 0 }),
      }),
    );
    const { fetchCamerasChunked } = await import("./cameraService");

    await fetchCamerasChunked(undefined, () => {});

    const calledUrl = new URL(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
    );
    expect(calledUrl.searchParams.has("south")).toBe(false);
  });
});
