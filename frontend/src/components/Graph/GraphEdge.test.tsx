import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GraphEdge } from "./GraphEdge";
import type { GraphEdge as GraphEdgeType } from "../../types/graph";

describe("GraphEdge", () => {
  it("renders the score, explain rule and timestamp from edge.attributes", () => {
    const edge = {
      ref: { table: "near", id: "abc" },
      relation: "near",
      from: { table: "seismic_event", id: "e1" },
      to: { table: "nuclear_site", id: "n1" },
      attributes: {
        score: 0.7333,
        timestamp: "2026-08-13T07:57:08Z",
        source: "consumer_graph",
        explain: {
          rule: "near:seismic_critical_infrastructure",
          distance_km: 42.17,
        },
      },
    } satisfies GraphEdgeType;

    render(<GraphEdge edge={edge} />);

    expect(screen.getByText("near")).toBeTruthy();
    expect(screen.getByText("score 0.73")).toBeTruthy();
    expect(
      screen.getByText(/near:seismic_critical_infrastructure/),
    ).toBeTruthy();
    expect(screen.getByText(/seismic_event:e1/)).toBeTruthy();
    expect(screen.getByText(/nuclear_site:n1/)).toBeTruthy();
  });

  it("renders just the endpoints when attributes are absent", () => {
    const edge = {
      ref: { table: "located_in", id: "abc" },
      relation: "located_in",
      from: { table: "camera", id: "c1" },
      to: { table: "zone", id: "z1" },
    } satisfies GraphEdgeType;

    render(<GraphEdge edge={edge} />);

    expect(screen.getByText("located_in")).toBeTruthy();
    expect(screen.queryByText(/score/)).toBeNull();
  });
});
