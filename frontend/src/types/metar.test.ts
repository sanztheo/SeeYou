import { describe, it, expect } from "vitest";
import { ALL_FLIGHT_CATEGORIES, FLIGHT_CATEGORY_COLORS } from "./metar";

describe("metar types", () => {
  it("ALL_FLIGHT_CATEGORIES contains VFR, MVFR, IFR, LIFR in order", () => {
    expect(ALL_FLIGHT_CATEGORIES).toEqual(["VFR", "MVFR", "IFR", "LIFR"]);
  });

  it("every flight category has a distinct color", () => {
    const colors = new Set(Object.values(FLIGHT_CATEGORY_COLORS));
    expect(colors.size).toBe(4);
  });

  it("VFR is green-ish, IFR is red-ish", () => {
    expect(FLIGHT_CATEGORY_COLORS.VFR).toBe("#22C55E");
    expect(FLIGHT_CATEGORY_COLORS.IFR).toBe("#EF4444");
  });

  it("all colors are valid hex", () => {
    for (const color of Object.values(FLIGHT_CATEGORY_COLORS)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("every category in the list has a color entry", () => {
    for (const cat of ALL_FLIGHT_CATEGORIES) {
      expect(FLIGHT_CATEGORY_COLORS[cat]).toBeDefined();
    }
  });
});
