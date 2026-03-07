import { Cartesian2, Entity } from "cesium";
import { describe, expect, it } from "vitest";
import {
  buildRelationLineEntityOptions,
  buildRelationLineSegments,
  setHoveredRelationLine,
} from "./RelationLines";
import type { GraphSnapshot } from "../../types/graph";

function baseSnapshot(): GraphSnapshot {
  return {
    root: { table: "aircraft", id: "abc" },
    nodes: [
      {
        ref: { table: "aircraft", id: "abc" },
        label: "AF123",
        lat: 48.8566,
        lon: 2.3522,
      },
      {
        ref: { table: "camera", id: "cam-1" },
        label: "Paris Cam",
        entity: { lat: 48.8666, lon: 2.3522 },
      },
      {
        ref: { table: "zone", id: "city-paris" },
        label: "Paris",
        entity: { centroid: [2.3522, 48.8566] },
      },
      {
        ref: { table: "satellite", id: "25544" },
        label: "ISS",
        lat: 40,
        lon: 10,
      },
    ],
    edges: [
      {
        ref: { table: "monitored_by", id: "edge-1" },
        relation: "monitored_by",
        from: { table: "aircraft", id: "abc" },
        to: { table: "camera", id: "cam-1" },
      },
      {
        ref: { table: "flies_over", id: "edge-2" },
        relation: "flies_over",
        from: { table: "aircraft", id: "abc" },
        to: { table: "zone", id: "city-paris" },
      },
      {
        ref: { table: "passes_over", id: "edge-3" },
        relation: "passes_over",
        from: { table: "satellite", id: "25544" },
        to: { table: "zone", id: "city-paris" },
      },
    ],
  };
}

describe("buildRelationLineSegments", () => {
  it("returns only edges adjacent to focused node", () => {
    const snapshot = baseSnapshot();

    const lines = buildRelationLineSegments(snapshot, {
      table: "aircraft",
      id: "abc",
    });

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.relation).sort()).toEqual([
      "flies_over",
      "monitored_by",
    ]);
  });

  it("uses node lat/lon and entity fallback coordinates", () => {
    const snapshot = baseSnapshot();

    const lines = buildRelationLineSegments(snapshot, {
      table: "aircraft",
      id: "abc",
    });

    const cameraLine = lines.find((line) => line.relation === "monitored_by");
    expect(cameraLine).toBeDefined();
    expect(cameraLine?.to.lat).toBe(48.8666);
    expect(cameraLine?.to.lon).toBe(2.3522);
  });

  it("supports zone centroid fallback", () => {
    const snapshot = baseSnapshot();

    const lines = buildRelationLineSegments(snapshot, {
      table: "zone",
      id: "city-paris",
    });

    expect(lines).toHaveLength(2);
    expect(lines[0].from.lat).toBeTypeOf("number");
    expect(lines[0].from.lon).toBeTypeOf("number");
  });

  it("ignores edges when one endpoint has no usable coordinates", () => {
    const snapshot = baseSnapshot();
    snapshot.nodes.push({
      ref: { table: "event", id: "evt-1" },
      label: "No coords",
    });
    snapshot.edges.push({
      ref: { table: "related_to", id: "edge-4" },
      relation: "related_to",
      from: { table: "aircraft", id: "abc" },
      to: { table: "event", id: "evt-1" },
    });

    const lines = buildRelationLineSegments(snapshot, {
      table: "aircraft",
      id: "abc",
    });

    expect(lines.map((line) => line.relation)).not.toContain("related_to");
  });

  it("respects maxLines limit", () => {
    const snapshot = baseSnapshot();

    const lines = buildRelationLineSegments(
      snapshot,
      { table: "aircraft", id: "abc" },
      1,
    );

    expect(lines).toHaveLength(1);
  });
});


describe("buildRelationLineEntityOptions", () => {
  it("adds hidden relation labels at the segment midpoint", () => {
    const [entity] = buildRelationLineEntityOptions([
      {
        id: "monitored_by:edge-1",
        relation: "monitored_by",
        from: { lat: 48.8566, lon: 2.3522 },
        to: { lat: 48.8666, lon: 2.3522 },
      },
    ]);

    expect(entity.id).toBe("monitored_by:edge-1");
    expect(entity.label?.text).toBe("monitored_by");
    expect(entity.label?.show).toBe(false);
    expect(entity.label?.pixelOffset).toEqual(new Cartesian2(0, -8));
    expect(entity.position).toBeDefined();
    expect(entity.polyline?.positions).toHaveLength(2);
  });
});

describe("setHoveredRelationLine", () => {
  it("shows only the hovered relation label", () => {
    const first = new Entity({
      id: "edge-1",
      label: { text: "monitored_by", show: false },
    });
    const second = new Entity({
      id: "edge-2",
      label: { text: "flies_over", show: false },
    });

    setHoveredRelationLine([first, second], "edge-2");
    expect(first.label?.show?.getValue()).toBe(false);
    expect(second.label?.show?.getValue()).toBe(true);

    setHoveredRelationLine([first, second], null);
    expect(first.label?.show?.getValue()).toBe(false);
    expect(second.label?.show?.getValue()).toBe(false);
  });
});
