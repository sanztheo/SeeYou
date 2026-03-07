import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GraphNode } from "./GraphNode";
import type { GraphNode as GraphNodeType } from "../../types/graph";

function renderNode(node: GraphNodeType, isActive = false) {
  const onClick = vi.fn();
  render(<GraphNode node={node} isActive={isActive} onClick={onClick} />);
  return { onClick };
}

describe("GraphNode", () => {
  it("renders table-specific sigil and accent treatment", () => {
    renderNode({
      ref: { table: "aircraft", id: "af123" },
      label: "AF123",
      subtitle: "Paris → NYC",
    });

    expect(screen.getByText("✈")).toBeTruthy();

    const badge = screen.getByText("aircraft");
    expect(badge.className).toContain("text-sky-300");
    expect(badge.className).toContain("border-sky-400/30");
  });

  it("falls back to the default emerald treatment and remains clickable", () => {
    const node = {
      ref: { table: "unknown_feed", id: "u-1" },
      label: "Unknown feed",
    } satisfies GraphNodeType;
    const { onClick } = renderNode(node, true);

    expect(screen.getByText("◈")).toBeTruthy();

    const badge = screen.getByText("unknown_feed");
    expect(badge.className).toContain("text-emerald-300");

    fireEvent.click(screen.getByRole("button", { name: /Unknown feed/i }));
    expect(onClick).toHaveBeenCalledWith(node);
  });
});
