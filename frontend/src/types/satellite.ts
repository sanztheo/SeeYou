export interface SatellitePosition {
  norad_id: number;
  name: string;
  category: SatelliteCategory;
  lat: number;
  lon: number;
  altitude_km: number;
  velocity_km_s: number;
}

export type SatelliteCategory =
  | "Station"
  | "Starlink"
  | "Communication"
  | "Military"
  | "Weather"
  | "Navigation"
  | "Science"
  | "Other";

export interface SatelliteFilter {
  showStation: boolean;
  showStarlink: boolean;
  showCommunication: boolean;
  showMilitary: boolean;
  showWeather: boolean;
  showNavigation: boolean;
  showScience: boolean;
  showOther: boolean;
}

export const DEFAULT_SATELLITE_FILTER: SatelliteFilter = {
  showStation: true,
  showStarlink: false,
  showCommunication: true,
  showMilitary: true,
  showWeather: true,
  showNavigation: true,
  showScience: true,
  showOther: false,
};

export const SATELLITE_CATEGORIES: SatelliteCategory[] = [
  "Station",
  "Starlink",
  "Communication",
  "Military",
  "Weather",
  "Navigation",
  "Science",
  "Other",
];

export const CATEGORY_FILTER_KEY: Record<
  SatelliteCategory,
  keyof SatelliteFilter
> = {
  Station: "showStation",
  Starlink: "showStarlink",
  Communication: "showCommunication",
  Military: "showMilitary",
  Weather: "showWeather",
  Navigation: "showNavigation",
  Science: "showScience",
  Other: "showOther",
};
