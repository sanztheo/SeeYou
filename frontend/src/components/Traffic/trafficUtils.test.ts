import { describe, it, expect } from "vitest";
import { typeVisible, bboxKey, bboxContains } from "./trafficUtils";
import type { TrafficFilter, BoundingBox } from "../../types/traffic";

const BASE_FILTER: TrafficFilter = {
  enabled: true,
  showMotorway: true,
  showTrunk: true,
  showPrimary: true,
  showSecondary: true,
};

describe("typeVisible", () => {
  it("returns true for each enabled road type", () => {
    expect(typeVisible(BASE_FILTER, "Motorway")).toBe(true);
    expect(typeVisible(BASE_FILTER, "Trunk")).toBe(true);
    expect(typeVisible(BASE_FILTER, "Primary")).toBe(true);
    expect(typeVisible(BASE_FILTER, "Secondary")).toBe(true);
  });

  it("returns false when a specific type is disabled", () => {
    expect(
      typeVisible({ ...BASE_FILTER, showMotorway: false }, "Motorway"),
    ).toBe(false);
    expect(typeVisible({ ...BASE_FILTER, showTrunk: false }, "Trunk")).toBe(
      false,
    );
    expect(typeVisible({ ...BASE_FILTER, showPrimary: false }, "Primary")).toBe(
      false,
    );
    expect(
      typeVisible({ ...BASE_FILTER, showSecondary: false }, "Secondary"),
    ).toBe(false);
  });

  it("returns false for Tertiary when showTertiary is undefined", () => {
    expect(typeVisible(BASE_FILTER, "Tertiary")).toBe(false);
  });

  it("returns true for Tertiary when showTertiary is true", () => {
    expect(
      typeVisible({ ...BASE_FILTER, showTertiary: true }, "Tertiary"),
    ).toBe(true);
  });

  it("returns false for Tertiary when showTertiary is false", () => {
    expect(
      typeVisible({ ...BASE_FILTER, showTertiary: false }, "Tertiary"),
    ).toBe(false);
  });

  it("returns false for unknown road types", () => {
    expect(typeVisible(BASE_FILTER, "Unknown" as never)).toBe(false);
  });
});

describe("bboxKey", () => {
  it("produces deterministic key with 2 decimal places", () => {
    const bbox: BoundingBox = {
      south: 48.123456,
      west: 2.987654,
      north: 49.5,
      east: 3.0,
    };
    expect(bboxKey(bbox)).toBe("48.12,2.99,49.50,3.00");
  });

  it("handles negative coordinates", () => {
    const bbox: BoundingBox = {
      south: -33.87,
      west: -70.65,
      north: -33.4,
      east: -70.5,
    };
    expect(bboxKey(bbox)).toBe("-33.87,-70.65,-33.40,-70.50");
  });

  it("same bbox always produces same key", () => {
    const bbox: BoundingBox = { south: 0, west: 0, north: 1, east: 1 };
    expect(bboxKey(bbox)).toBe(bboxKey(bbox));
  });
});

describe("bboxContains", () => {
  const outer: BoundingBox = { south: 48.0, west: 2.0, north: 49.0, east: 3.0 };

  it("returns true when inner is fully inside outer", () => {
    const inner: BoundingBox = {
      south: 48.2,
      west: 2.2,
      north: 48.8,
      east: 2.8,
    };
    expect(bboxContains(outer, inner)).toBe(true);
  });

  it("returns true for identical bboxes", () => {
    expect(bboxContains(outer, { ...outer })).toBe(true);
  });

  it("returns true within epsilon tolerance (0.01 deg)", () => {
    const slightlyOutside: BoundingBox = {
      south: 47.995,
      west: 1.995,
      north: 49.005,
      east: 3.005,
    };
    expect(bboxContains(outer, slightlyOutside)).toBe(true);
  });

  it("returns false when inner extends well beyond outer", () => {
    const bigger: BoundingBox = {
      south: 47.0,
      west: 1.0,
      north: 50.0,
      east: 4.0,
    };
    expect(bboxContains(outer, bigger)).toBe(false);
  });

  it("returns false when inner is completely outside", () => {
    const outside: BoundingBox = {
      south: 30.0,
      west: 10.0,
      north: 31.0,
      east: 11.0,
    };
    expect(bboxContains(outer, outside)).toBe(false);
  });
});
