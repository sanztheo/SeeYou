import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CameraVisibilityPanel } from "./CameraVisibilityPanel";
import type { AircraftCamerasResponse } from "../../types/cameraVisibility";

function response(
  overrides: Partial<AircraftCamerasResponse> = {},
): AircraftCamerasResponse {
  return {
    icao: "a1ed21",
    model: "cv_coldstart",
    current_altitude_m: 389,
    seeing_now: [],
    will_see: [],
    filtered_reason: null,
    notes: [],
    ...overrides,
  };
}

function mockFetchOnce(body: AircraftCamerasResponse, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    }),
  );
}

describe("CameraVisibilityPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a loading placeholder before the fetch resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    render(<CameraVisibilityPanel icao="a1ed21" />);

    expect(screen.getByText(/checking camera coverage/i)).toBeInTheDocument();
  });

  it("renders seeing-now and will-see sightings with level badges", async () => {
    mockFetchOnce(
      response({
        seeing_now: [
          {
            camera_id: "caltrans-d7-675",
            camera_name: "I-405 : (675) Ventura Blvd",
            source: "caltrans",
            level: "recognition",
            score: 1.0,
            geometry: {
              bearing_deg: 15.2,
              elevation_deg: 12.9,
              horizontal_distance_m: 1659,
              slant_distance_m: 1702,
            },
            explain: ["in FOV cone"],
          },
        ],
        will_see: [
          {
            camera_id: "otc-4089",
            camera_name: "US-101 : (4089) Coldwater Canyon",
            source: "otcmap_california",
            level: "detection",
            t_minus_secs: 33,
            duration_secs: 60,
            geometry: {
              bearing_deg: 200,
              elevation_deg: 5,
              horizontal_distance_m: 9000,
              slant_distance_m: 9200,
            },
            explain: ["in FOV cone"],
          },
        ],
        notes: ["1 sighting(s) come from cameras with no reliable heading"],
      }),
    );

    render(<CameraVisibilityPanel icao="a1ed21" />);

    await waitFor(() => {
      expect(screen.getByText(/seeing now \(1\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText("I-405 : (675) Ventura Blvd")).toBeInTheDocument();
    expect(screen.getByText("RECOGNITION")).toBeInTheDocument();

    expect(screen.getByText(/will see \(1\)/i)).toBeInTheDocument();
    expect(
      screen.getByText("US-101 : (4089) Coldwater Canyon"),
    ).toBeInTheDocument();
    expect(screen.getByText("DETECTION")).toBeInTheDocument();
    expect(screen.getByText(/T-33s/)).toBeInTheDocument();

    expect(screen.getByText(/no reliable heading/i)).toBeInTheDocument();
  });

  it("shows the explicit cruise-altitude filter note instead of an empty list", async () => {
    mockFetchOnce(
      response({
        current_altitude_m: 10009,
        filtered_reason: "cruise_altitude",
        notes: [
          "aircraft stays above the 3000 m cruise cutoff for the next 180s (currently 10009 m) — not evaluated",
        ],
      }),
    );

    render(<CameraVisibilityPanel icao="39cf06" />);

    await waitFor(() => {
      expect(screen.getByText(/cruise cutoff/i)).toBeInTheDocument();
    });
    // Never renders a bare empty list as if there were simply no coverage.
    expect(
      screen.queryByText(/no camera coverage nearby/i),
    ).not.toBeInTheDocument();
  });

  it("distinguishes genuine no-coverage from the cruise filter", async () => {
    mockFetchOnce(response());

    render(<CameraVisibilityPanel icao="43c91b" />);

    await waitFor(() => {
      expect(
        screen.getByText(/no camera coverage nearby/i),
      ).toBeInTheDocument();
    });
  });

  it("shows an error state when the request fails", async () => {
    mockFetchOnce(response(), false);

    render(<CameraVisibilityPanel icao="ghost" />);

    await waitFor(() => {
      expect(
        screen.getByText(/camera coverage unavailable/i),
      ).toBeInTheDocument();
    });
  });
});
