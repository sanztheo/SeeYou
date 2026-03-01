import { describe, it, expect } from "vitest";
import { CAPITALS } from "./capitals";

describe("capitals data integrity", () => {
  it("has no duplicate entries (same name + country)", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const c of CAPITALS) {
      const key = `${c.name}_${c.country}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it("has no overlapping coordinates (within 0.001 deg)", () => {
    const overlaps: string[] = [];
    for (let i = 0; i < CAPITALS.length; i++) {
      for (let j = i + 1; j < CAPITALS.length; j++) {
        const a = CAPITALS[i];
        const b = CAPITALS[j];
        if (
          Math.abs(a.lat - b.lat) < 0.001 &&
          Math.abs(a.lon - b.lon) < 0.001
        ) {
          overlaps.push(
            `${a.name}(${a.country}) overlaps ${b.name}(${b.country})`,
          );
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("all coordinates are within valid ranges", () => {
    for (const c of CAPITALS) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
    }
  });

  it("all populations are positive", () => {
    for (const c of CAPITALS) {
      expect(c.population).toBeGreaterThan(0);
    }
  });

  it("all names and countries are non-empty", () => {
    for (const c of CAPITALS) {
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.country.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not contain Delhi duplicate (only New Delhi for India)", () => {
    const indiaCapitals = CAPITALS.filter(
      (c) =>
        c.country === "India" && (c.name === "Delhi" || c.name === "New Delhi"),
    );
    expect(indiaCapitals).toHaveLength(1);
    expect(indiaCapitals[0].name).toBe("New Delhi");
  });

  it("Burundi capital is Gitega (not Bujumbura)", () => {
    const burundi = CAPITALS.find((c) => c.country === "Burundi");
    expect(burundi).toBeDefined();
    expect(burundi!.name).toBe("Gitega");
  });

  it("has at least 150 entries", () => {
    expect(CAPITALS.length).toBeGreaterThanOrEqual(150);
  });
});
