import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CameraPlayer } from "./CameraPlayer";
import type { Camera } from "../../types/camera";

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: "cam-1",
    name: "I-80 WB @ Main",
    lat: 37.8,
    lon: -122.2,
    city: "Oakland",
    country: "US",
    source: "caltrans",
    stream_url: "https://example.com/cam.jpg",
    stream_type: "ImageRefresh",
    is_online: true,
    ...overrides,
  };
}

describe("CameraPlayer", () => {
  it("shows direction and fov metadata when provided", () => {
    render(
      <CameraPlayer
        camera={makeCamera()}
        viewInfo={{ headingDeg: 270, fovDeg: 42, source: "provider" }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/DIR 270° W/i)).toBeInTheDocument();
    expect(screen.getByText(/FOV 42°/i)).toBeInTheDocument();
    expect(screen.getByText(/fiable/i)).toBeInTheDocument();
  });
});
