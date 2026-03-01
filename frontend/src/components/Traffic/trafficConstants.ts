import { Color } from "cesium";
import type { RoadType } from "../../types/traffic";

export const MAX_ALT = 50_000;
export const LOAD_DEBOUNCE_MS = 400;
export const LRU_MAX_ENTRIES = 8;

export const ROAD_COLOR: Record<RoadType, Color> = {
  Motorway: Color.fromCssColorString("#FFEB3B"),
  Trunk: Color.fromCssColorString("#FF9800"),
  Primary: Color.WHITE,
  Secondary: Color.fromCssColorString("#AED581"),
  Tertiary: Color.DARKGRAY,
};

export const ROAD_WIDTH: Record<RoadType, number> = {
  Motorway: 4,
  Trunk: 3,
  Primary: 2,
  Secondary: 1.5,
  Tertiary: 1,
};
