import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MetarPopup } from "./MetarPopup";
import type { MetarStation } from "../../types/metar";

afterEach(cleanup);

const mockStation: MetarStation = {
  station_id: "KJFK",
  lat: 40.6399,
  lon: -73.7787,
  temp_c: 22,
  dewpoint_c: 15,
  wind_dir_deg: 270,
  wind_speed_kt: 12,
  wind_gust_kt: 25,
  visibility_m: 9999,
  ceiling_ft: 3500,
  flight_category: "VFR",
  raw_metar: "KJFK 011856Z 27012G25KT 10SM FEW035 22/15 A3012",
};

describe("MetarPopup", () => {
  it("renders nothing when station is null", () => {
    const { container } = render(
      <MetarPopup station={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows station ID", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText("KJFK")).toBeInTheDocument();
  });

  it("shows flight category badge", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText("VFR")).toBeInTheDocument();
  });

  it("shows temperature and dewpoint", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText("22°C / 15°C")).toBeInTheDocument();
  });

  it("shows wind with gust", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText("270° @ 12 kt (G25)")).toBeInTheDocument();
  });

  it("shows wind without gust when gust is null", () => {
    const noGust = { ...mockStation, wind_gust_kt: null };
    render(<MetarPopup station={noGust} onClose={() => {}} />);
    expect(screen.getByText("270° @ 12 kt")).toBeInTheDocument();
  });

  it("shows dash for wind when wind_speed_kt is null", () => {
    const noWind = { ...mockStation, wind_speed_kt: null };
    render(<MetarPopup station={noWind} onClose={() => {}} />);
    const windRow = screen.getByText("Wind").closest("div")!;
    expect(windRow.textContent).toContain("—");
  });

  it("shows visibility >10 km for 9999m", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText(">10 km")).toBeInTheDocument();
  });

  it("shows visibility in km for values below 9999", () => {
    const lowVis = { ...mockStation, visibility_m: 5000 };
    render(<MetarPopup station={lowVis} onClose={() => {}} />);
    expect(screen.getByText("5.0 km")).toBeInTheDocument();
  });

  it("shows ceiling in feet", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText("3,500 ft")).toBeInTheDocument();
  });

  it("shows CLR when ceiling is null", () => {
    const clr = { ...mockStation, ceiling_ft: null };
    render(<MetarPopup station={clr} onClose={() => {}} />);
    expect(screen.getByText("CLR")).toBeInTheDocument();
  });

  it("shows raw METAR string", () => {
    render(<MetarPopup station={mockStation} onClose={() => {}} />);
    expect(screen.getByText("Raw METAR")).toBeInTheDocument();
    expect(
      screen.getByText("KJFK 011856Z 27012G25KT 10SM FEW035 22/15 A3012"),
    ).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<MetarPopup station={mockStation} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows different flight category badges", () => {
    const ifr = { ...mockStation, flight_category: "IFR" };
    render(<MetarPopup station={ifr} onClose={() => {}} />);
    expect(screen.getByText("IFR")).toBeInTheDocument();
  });

  it("shows VRB for variable wind direction", () => {
    const vrb = { ...mockStation, wind_dir_deg: null };
    render(<MetarPopup station={vrb} onClose={() => {}} />);
    expect(screen.getByText("VRB° @ 12 kt (G25)")).toBeInTheDocument();
  });
});
