import { describe, it, expect } from "vitest";
import {
  ALL_EVENT_CATEGORIES,
  EVENT_CATEGORY_COLORS,
  EVENT_CATEGORY_LABELS,
} from "./events";
import type { EventCategory } from "./events";

describe("event types", () => {
  it("ALL_EVENT_CATEGORIES contains all expected categories", () => {
    expect(ALL_EVENT_CATEGORIES).toContain("Wildfires");
    expect(ALL_EVENT_CATEGORIES).toContain("SevereStorms");
    expect(ALL_EVENT_CATEGORIES).toContain("Volcanoes");
    expect(ALL_EVENT_CATEGORIES).toContain("Earthquakes");
    expect(ALL_EVENT_CATEGORIES).toContain("Floods");
    expect(ALL_EVENT_CATEGORIES).toContain("SeaAndLakeIce");
    expect(ALL_EVENT_CATEGORIES).toHaveLength(6);
  });

  it("does not include Other in active categories", () => {
    expect(ALL_EVENT_CATEGORIES).not.toContain("Other");
  });

  it("every category has a valid hex color", () => {
    for (const cat of ALL_EVENT_CATEGORIES) {
      expect(EVENT_CATEGORY_COLORS[cat]).toBeDefined();
      expect(EVENT_CATEGORY_COLORS[cat]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("every category has a non-empty label", () => {
    for (const cat of ALL_EVENT_CATEGORIES) {
      expect(EVENT_CATEGORY_LABELS[cat]).toBeDefined();
      expect(EVENT_CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
    }
  });

  it("Other category has fallback color and label", () => {
    expect(EVENT_CATEGORY_COLORS["Other" as EventCategory]).toBeDefined();
    expect(EVENT_CATEGORY_LABELS["Other" as EventCategory]).toBeDefined();
  });

  it("all colors are unique", () => {
    const colors = Object.values(EVENT_CATEGORY_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});
