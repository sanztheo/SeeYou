import { describe, expect, it } from "vitest";
import type { Camera } from "../../types/camera";
import {
  clampFovDeg,
  compassLabel,
  defaultFovForSource,
  parseHeadingFromHint,
  resolveCameraView,
} from "./cameraView";

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: "cam-1",
    name: "Test Cam",
    lat: 40,
    lon: -74,
    city: "New York",
    country: "US",
    source: "nycdot",
    stream_url: "https://example.com/cam.jpg",
    stream_type: "ImageRefresh",
    is_online: true,
    ...overrides,
  };
}

describe("cameraView helpers", () => {
  it("prefers provider heading when available", () => {
    const cam = makeCamera({
      view_heading_deg: 271.2,
      view_heading_source: "provider",
      view_fov_deg: 44,
    });
    const view = resolveCameraView(cam, [cam]);
    expect(view.headingDeg).toBeCloseTo(271.2, 2);
    expect(view.fovDeg).toBe(44);
    expect(view.source).toBe("provider");
  });

  it("parses heading from hint/name", () => {
    const cam = makeCamera({
      name: "I-80 WB @ Main St",
      view_heading_deg: undefined,
      view_hint: "Westbound",
    });
    const view = resolveCameraView(cam, [cam]);
    expect(view.headingDeg).toBe(270);
    expect(view.source).toBe("parsed");
  });

  it("falls back to city centroid when no hint exists", () => {
    const cam = makeCamera({
      id: "a",
      lat: 40.0,
      lon: -74.0,
      name: "No direction",
      view_heading_deg: undefined,
      view_hint: undefined,
    });
    const b = makeCamera({
      id: "b",
      lat: 40.0,
      lon: -73.0,
      name: "Another cam",
      view_heading_deg: undefined,
      view_hint: undefined,
    });
    const view = resolveCameraView(cam, [cam, b]);
    expect(view.source).toBe("estimated");
    expect(view.headingDeg).toBeCloseTo(90, 0);
  });

  it("falls back to north when no centroid exists", () => {
    const cam = makeCamera({
      name: "Unknown view",
      city: "SoloCity",
      view_heading_deg: undefined,
      view_hint: undefined,
    });
    const view = resolveCameraView(cam, [cam]);
    expect(view.source).toBe("estimated");
    expect(view.headingDeg).toBe(0);
  });

  it("maps default fov by source", () => {
    expect(defaultFovForSource("otcmap_california")).toBe(42);
    expect(defaultFovForSource("mcp.camera")).toBe(50);
    expect(defaultFovForSource("generic")).toBe(68);
    expect(defaultFovForSource("other")).toBe(55);
  });

  it("clamps fov and provides compass labels", () => {
    expect(clampFovDeg(5)).toBe(20);
    expect(clampFovDeg(200)).toBe(120);
    expect(parseHeadingFromHint("NE")).toBe(45);
    expect(compassLabel(271)).toBe("W");
  });
});
