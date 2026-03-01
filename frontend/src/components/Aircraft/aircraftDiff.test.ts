import { describe, it, expect } from "vitest";
import type { AircraftPosition, AircraftFilter } from "../../types/aircraft";
import { filterVisibleAircraft, computeEntityDiff } from "./aircraftUtils";

function makeAircraft(
  icao: string,
  overrides: Partial<AircraftPosition> = {},
): AircraftPosition {
  return {
    icao,
    callsign: `CS${icao}`,
    aircraft_type: "B738",
    lat: 48.8566,
    lon: 2.3522,
    altitude_m: 10000,
    speed_ms: 250,
    heading: 90,
    vertical_rate_ms: 0,
    on_ground: false,
    is_military: false,
    ...overrides,
  };
}

function makeMap(
  ...aircraft: AircraftPosition[]
): Map<string, AircraftPosition> {
  const m = new Map<string, AircraftPosition>();
  for (const ac of aircraft) m.set(ac.icao, ac);
  return m;
}

// ── filterVisibleAircraft ─────────────────────────────────────

describe("filterVisibleAircraft", () => {
  const showAll: AircraftFilter = { showCivilian: true, showMilitary: true };
  const civOnly: AircraftFilter = { showCivilian: true, showMilitary: false };
  const milOnly: AircraftFilter = { showCivilian: false, showMilitary: true };
  const showNone: AircraftFilter = { showCivilian: false, showMilitary: false };

  it("returns all aircraft when both filters enabled", () => {
    const aircraft = makeMap(
      makeAircraft("A1"),
      makeAircraft("A2", { is_military: true }),
      makeAircraft("A3"),
    );
    const visible = filterVisibleAircraft(aircraft, showAll);
    expect(visible.size).toBe(3);
    expect([...visible.keys()].sort()).toEqual(["A1", "A2", "A3"]);
  });

  it("filters out military when showMilitary=false", () => {
    const aircraft = makeMap(
      makeAircraft("CIV1"),
      makeAircraft("MIL1", { is_military: true }),
      makeAircraft("CIV2"),
      makeAircraft("MIL2", { is_military: true }),
    );
    const visible = filterVisibleAircraft(aircraft, civOnly);
    expect(visible.size).toBe(2);
    expect(visible.has("CIV1")).toBe(true);
    expect(visible.has("CIV2")).toBe(true);
    expect(visible.has("MIL1")).toBe(false);
    expect(visible.has("MIL2")).toBe(false);
  });

  it("filters out civilian when showCivilian=false", () => {
    const aircraft = makeMap(
      makeAircraft("CIV1"),
      makeAircraft("MIL1", { is_military: true }),
    );
    const visible = filterVisibleAircraft(aircraft, milOnly);
    expect(visible.size).toBe(1);
    expect(visible.has("MIL1")).toBe(true);
  });

  it("returns empty when both filters disabled", () => {
    const aircraft = makeMap(
      makeAircraft("A1"),
      makeAircraft("A2", { is_military: true }),
    );
    const visible = filterVisibleAircraft(aircraft, showNone);
    expect(visible.size).toBe(0);
  });

  it("handles empty aircraft map", () => {
    const visible = filterVisibleAircraft(new Map(), showAll);
    expect(visible.size).toBe(0);
  });

  it("preserves aircraft data in output map", () => {
    const ac = makeAircraft("A1", { lat: 12.5, lon: 99.9, heading: 180 });
    const aircraft = makeMap(ac);
    const visible = filterVisibleAircraft(aircraft, showAll);
    const result = visible.get("A1")!;
    expect(result.lat).toBe(12.5);
    expect(result.lon).toBe(99.9);
    expect(result.heading).toBe(180);
  });
});

// ── computeEntityDiff ─────────────────────────────────────────

describe("computeEntityDiff", () => {
  it("initial load: all aircraft are additions when nothing rendered", () => {
    const visible = makeMap(
      makeAircraft("A1"),
      makeAircraft("A2"),
      makeAircraft("A3"),
    );
    const rendered = new Set<string>();
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toAdd).toHaveLength(3);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toRemove).toHaveLength(0);
    expect(diff.toAdd.map((a) => a.icao).sort()).toEqual(["A1", "A2", "A3"]);
  });

  it("steady state: all aircraft are updates when same set rendered", () => {
    const visible = makeMap(
      makeAircraft("A1", { lat: 49.0 }),
      makeAircraft("A2", { lat: 50.0 }),
    );
    const rendered = new Set(["A1", "A2"]);
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(2);
    expect(diff.toRemove).toHaveLength(0);
  });

  it("departures: aircraft that left become removals", () => {
    const visible = makeMap(makeAircraft("A1"));
    const rendered = new Set(["A1", "A2", "A3"]);
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].icao).toBe("A1");
    expect(diff.toRemove.sort()).toEqual(["A2", "A3"]);
    expect(diff.toAdd).toHaveLength(0);
  });

  it("arrivals: new aircraft become additions", () => {
    const visible = makeMap(
      makeAircraft("A1"),
      makeAircraft("NEW1"),
      makeAircraft("NEW2"),
    );
    const rendered = new Set(["A1"]);
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0].icao).toBe("A1");
    expect(diff.toAdd).toHaveLength(2);
    expect(diff.toAdd.map((a) => a.icao).sort()).toEqual(["NEW1", "NEW2"]);
    expect(diff.toRemove).toHaveLength(0);
  });

  it("mixed: handles simultaneous arrivals, departures, and updates", () => {
    const visible = makeMap(
      makeAircraft("STAY1"),
      makeAircraft("STAY2"),
      makeAircraft("NEW1"),
    );
    const rendered = new Set(["STAY1", "STAY2", "GONE1", "GONE2"]);
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toUpdate.map((a) => a.icao).sort()).toEqual(["STAY1", "STAY2"]);
    expect(diff.toAdd.map((a) => a.icao)).toEqual(["NEW1"]);
    expect(diff.toRemove.sort()).toEqual(["GONE1", "GONE2"]);
  });

  it("complete turnover: all old removed, all new added", () => {
    const visible = makeMap(makeAircraft("B1"), makeAircraft("B2"));
    const rendered = new Set(["A1", "A2"]);
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toAdd).toHaveLength(2);
    expect(diff.toRemove).toHaveLength(2);
  });

  it("both empty: no operations", () => {
    const diff = computeEntityDiff(new Map(), new Set());
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toRemove).toHaveLength(0);
  });

  it("all removed: visible empty but rendered has entries", () => {
    const diff = computeEntityDiff(new Map(), new Set(["A1", "A2", "A3"]));
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toRemove).toHaveLength(3);
  });

  it("preserves aircraft data for additions and updates", () => {
    const ac = makeAircraft("A1", {
      lat: 55.5,
      heading: 270,
      is_military: true,
    });
    const visible = makeMap(ac);

    const diffAdd = computeEntityDiff(visible, new Set());
    expect(diffAdd.toAdd[0].lat).toBe(55.5);
    expect(diffAdd.toAdd[0].heading).toBe(270);
    expect(diffAdd.toAdd[0].is_military).toBe(true);

    const diffUpdate = computeEntityDiff(visible, new Set(["A1"]));
    expect(diffUpdate.toUpdate[0].lat).toBe(55.5);
    expect(diffUpdate.toUpdate[0].is_military).toBe(true);
  });
});

// ── Realistic scenario simulations ───────────────────────────

describe("realistic batch update scenarios", () => {
  it("simulates typical 5s update cycle with ~2000 aircraft", () => {
    const N = 2000;
    const DEPARTED = 50;
    const ARRIVED = 60;

    const oldAircraft: AircraftPosition[] = [];
    for (let i = 0; i < N; i++) {
      oldAircraft.push(makeAircraft(`AC${i}`));
    }
    const renderedIds = new Set(oldAircraft.map((a) => a.icao));

    const newAircraft = makeMap(
      ...oldAircraft.slice(DEPARTED).map((ac) => ({
        ...ac,
        lat: ac.lat + 0.01,
        lon: ac.lon + 0.01,
      })),
      ...Array.from({ length: ARRIVED }, (_, i) => makeAircraft(`NEW${i}`)),
    );

    const visible = filterVisibleAircraft(newAircraft, {
      showCivilian: true,
      showMilitary: true,
    });
    const diff = computeEntityDiff(visible, renderedIds);

    expect(diff.toRemove).toHaveLength(DEPARTED);
    expect(diff.toUpdate).toHaveLength(N - DEPARTED);
    expect(diff.toAdd).toHaveLength(ARRIVED);

    expect(diff.toRemove.every((id) => id.startsWith("AC"))).toBe(true);
    expect(diff.toAdd.every((ac) => ac.icao.startsWith("NEW"))).toBe(true);
  });

  it("filter toggle: switching off military removes them from visible", () => {
    const aircraft = makeMap(
      makeAircraft("CIV1"),
      makeAircraft("CIV2"),
      makeAircraft("MIL1", { is_military: true }),
      makeAircraft("MIL2", { is_military: true }),
    );
    const rendered = new Set(["CIV1", "CIV2", "MIL1", "MIL2"]);

    const visible = filterVisibleAircraft(aircraft, {
      showCivilian: true,
      showMilitary: false,
    });
    const diff = computeEntityDiff(visible, rendered);

    expect(diff.toUpdate.map((a) => a.icao).sort()).toEqual(["CIV1", "CIV2"]);
    expect(diff.toRemove.sort()).toEqual(["MIL1", "MIL2"]);
    expect(diff.toAdd).toHaveLength(0);
  });

  it("filter toggle: switching ON military after being off adds them", () => {
    const aircraft = makeMap(
      makeAircraft("CIV1"),
      makeAircraft("MIL1", { is_military: true }),
    );
    const renderedOnlyCiv = new Set(["CIV1"]);

    const visible = filterVisibleAircraft(aircraft, {
      showCivilian: true,
      showMilitary: true,
    });
    const diff = computeEntityDiff(visible, renderedOnlyCiv);

    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0].icao).toBe("MIL1");
    expect(diff.toRemove).toHaveLength(0);
  });

  it("diff counts always satisfy: add + update = visible.size, remove ⊆ rendered", () => {
    for (let trial = 0; trial < 20; trial++) {
      const visibleCount = Math.floor(Math.random() * 100);
      const renderedCount = Math.floor(Math.random() * 100);

      const visibleIds = Array.from(
        { length: visibleCount },
        (_, i) => `V${i}`,
      );
      const renderedIdsList = Array.from(
        { length: renderedCount },
        (_, i) => `R${i}`,
      );

      const visible = makeMap(...visibleIds.map((id) => makeAircraft(id)));
      const rendered = new Set(renderedIdsList);

      const diff = computeEntityDiff(visible, rendered);

      expect(diff.toAdd.length + diff.toUpdate.length).toBe(visible.size);

      for (const id of diff.toRemove) {
        expect(rendered.has(id)).toBe(true);
      }

      for (const ac of diff.toAdd) {
        expect(rendered.has(ac.icao)).toBe(false);
      }
      for (const ac of diff.toUpdate) {
        expect(rendered.has(ac.icao)).toBe(true);
      }
    }
  });
});
