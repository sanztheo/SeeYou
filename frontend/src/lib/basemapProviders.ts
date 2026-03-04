import type { BasemapStyle } from "../types/basemap";

export interface BasemapConfig {
  url: string;
  credit: string;
  subdomains?: string[];
}

const BASEMAP_CONFIGS: Record<BasemapStyle, BasemapConfig> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri, Maxar, Earthstar Geographics",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    credit: "OpenStreetMap contributors, CARTO",
    subdomains: ["a", "b", "c", "d"],
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    credit: "OpenStreetMap contributors, CARTO",
    subdomains: ["a", "b", "c", "d"],
  },
};

export function getBasemapConfig(style: BasemapStyle): BasemapConfig {
  return BASEMAP_CONFIGS[style];
}
