export type RoadType =
  | "Motorway"
  | "Trunk"
  | "Primary"
  | "Secondary"
  | "Tertiary";

export interface RoadNode {
  lat: number;
  lon: number;
}

export interface Road {
  id: number;
  road_type: RoadType;
  name: string | null;
  nodes: RoadNode[];
  speed_limit_kmh: number | null;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface TrafficFilter {
  enabled: boolean;
  showMotorway: boolean;
  showTrunk: boolean;
  showPrimary: boolean;
  showSecondary: boolean;
}
