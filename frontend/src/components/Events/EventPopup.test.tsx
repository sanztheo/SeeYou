import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { EventPopup } from "./EventPopup";
import type { NaturalEvent } from "../../types/events";

afterEach(cleanup);

const mockEvent: NaturalEvent = {
  id: "EONET_123",
  title: "Wildfire in California",
  category: "Wildfires",
  lat: 37.8,
  lon: -120.5,
  date: "2026-01-15",
  source_url: "https://example.com/event",
};

describe("EventPopup", () => {
  it("renders nothing when event is null", () => {
    const { container } = render(
      <EventPopup event={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders event title", () => {
    render(<EventPopup event={mockEvent} onClose={() => {}} />);
    expect(screen.getByText("Wildfire in California")).toBeInTheDocument();
  });

  it("shows category badge with label", () => {
    render(<EventPopup event={mockEvent} onClose={() => {}} />);
    expect(screen.getByText("WILDFIRES")).toBeInTheDocument();
  });

  it("shows date", () => {
    render(<EventPopup event={mockEvent} onClose={() => {}} />);
    expect(screen.getByText("2026-01-15")).toBeInTheDocument();
  });

  it("shows latitude and longitude", () => {
    render(<EventPopup event={mockEvent} onClose={() => {}} />);
    expect(screen.getByText("37.8000°")).toBeInTheDocument();
    expect(screen.getByText("-120.5000°")).toBeInTheDocument();
  });

  it("shows source link when source_url is provided", () => {
    render(<EventPopup event={mockEvent} onClose={() => {}} />);
    const link = screen.getByText("View source");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://example.com/event",
    );
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("hides source link when source_url is null", () => {
    const noSource = { ...mockEvent, source_url: null };
    render(<EventPopup event={noSource} onClose={() => {}} />);
    expect(screen.queryByText("View source")).not.toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<EventPopup event={mockEvent} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders category badge for SevereStorms", () => {
    const storm: NaturalEvent = {
      ...mockEvent,
      category: "SevereStorms",
      title: "Big Storm",
    };
    render(<EventPopup event={storm} onClose={() => {}} />);
    expect(screen.getByText("STORMS")).toBeInTheDocument();
  });
});
