import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CameraFilters } from "./CameraFilters";
import type { Camera, CameraFilter } from "../../types/camera";
import type { CameraProgress } from "../../services/cameraService";

afterEach(cleanup);

const baseFilter: CameraFilter = {
  enabled: false,
  cities: new Set(),
  sources: new Set(),
};

const doneProgress: CameraProgress = { loaded: 5, total: 5, done: true };
const emptyProgress: CameraProgress = { loaded: 0, total: 0, done: false };

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: "cam-1",
    name: "Test Cam",
    lat: 40,
    lon: -74,
    city: "New York",
    country: "US",
    source: "DOT",
    stream_url: "http://example.com/stream",
    stream_type: "Mjpeg",
    is_online: true,
    ...overrides,
  };
}

const mockCameras: Camera[] = [
  makeCamera({ id: "1", city: "New York", source: "DOT", is_online: true }),
  makeCamera({ id: "2", city: "New York", source: "DOT", is_online: false }),
  makeCamera({ id: "3", city: "London", source: "TfL", is_online: true }),
  makeCamera({ id: "4", city: "Paris", source: "Mairie", is_online: true }),
];

describe("CameraFilters", () => {
  it("renders cameras label", () => {
    render(
      <CameraFilters
        filter={baseFilter}
        cameras={[]}
        progress={emptyProgress}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("Cameras")).toBeInTheDocument();
  });

  it("toggle calls onFilterChange with enabled:true", () => {
    const onChange = vi.fn();
    render(
      <CameraFilters
        filter={baseFilter}
        cameras={[]}
        progress={emptyProgress}
        onFilterChange={onChange}
      />,
    );
    const buttons = document.querySelectorAll("button");
    const toggleBtn = Array.from(buttons).find((b) =>
      b.querySelector(".rounded-full.transition-colors"),
    )!;
    fireEvent.click(toggleBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("shows progress bar when loading", () => {
    const loadingProgress: CameraProgress = {
      loaded: 50,
      total: 200,
      done: false,
    };
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={[]}
        progress={loadingProgress}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText(/Loading cameras 50\/200/)).toBeInTheDocument();
  });

  it("shows connecting message when total is 0 and loading", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={[]}
        progress={emptyProgress}
        onFilterChange={() => {}}
      />,
    );
    expect(
      screen.getByText("Connecting to camera server…"),
    ).toBeInTheDocument();
  });

  it("shows online/total count when cameras are loaded", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={doneProgress}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText(/3 online \/ 4 total/)).toBeInTheDocument();
  });

  it("shows source filter chips with cyan styling", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={doneProgress}
        onFilterChange={() => {}}
      />,
    );
    const dotBtn = screen.getByText("DOT").closest("button")!;
    expect(dotBtn.className).toContain("cyan");
  });

  it("shows source count per chip", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={doneProgress}
        onFilterChange={() => {}}
      />,
    );
    const dotBtn = screen.getByText("DOT").closest("button")!;
    expect(dotBtn.textContent).toContain("2");
    const tflBtn = screen.getByText("TfL").closest("button")!;
    expect(tflBtn.textContent).toContain("1");
  });

  it("shows city filter chips with emerald styling", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={doneProgress}
        onFilterChange={() => {}}
      />,
    );
    const cityBtn = screen.getByText("London").closest("button")!;
    expect(cityBtn.className).toContain("emerald");
  });

  it("clicking a source chip calls onFilterChange with that source", () => {
    const onChange = vi.fn();
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={doneProgress}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("DOT").closest("button")!);
    const call = onChange.mock.calls[0][0] as CameraFilter;
    expect(call.sources.has("DOT")).toBe(true);
  });

  it("clicking a city chip calls onFilterChange with that city", () => {
    const onChange = vi.fn();
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={doneProgress}
        onFilterChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Paris").closest("button")!);
    const call = onChange.mock.calls[0][0] as CameraFilter;
    expect(call.cities.has("Paris")).toBe(true);
  });

  it("shows retry button when enabled, done, but no cameras", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={[]}
        progress={{ loaded: 0, total: 0, done: true }}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("Failed to load cameras")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows loaded count in header when enabled and progress has total", () => {
    render(
      <CameraFilters
        filter={{ ...baseFilter, enabled: true }}
        cameras={mockCameras}
        progress={{ loaded: 200, total: 200, done: true }}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByText("200")).toBeInTheDocument();
  });
});
