export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface TrafficFilter {
  enabled: boolean;
  showTilesOverlay: boolean;
  showFlowSegments: boolean;
  showIncidents: boolean;
  showAccidents: boolean;
  showRoadWorks: boolean;
  showClosures: boolean;
}

// --- TomTom Flow Segment ---

export interface FlowSegment {
  coordinates: [number, number][];
  current_speed: number;
  free_flow_speed: number;
  current_travel_time: number;
  free_flow_travel_time: number;
  confidence: number;
  road_closure: boolean;
}

// --- TomTom Incidents ---

export interface TrafficIncident {
  id: string;
  incident_type: string;
  severity: number;
  from_street: string;
  to_street: string;
  description: string;
  delay_seconds: number;
  length_meters: number;
  start_point: [number, number];
  end_point: [number, number];
  road_name: string;
}

// --- TomTom Routing ---

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RouteInstruction {
  distance_meters: number;
  travel_time_seconds: number;
  street: string;
  maneuver: string;
  point: RoutePoint;
}

export interface RouteResult {
  points: RoutePoint[];
  distance_meters: number;
  travel_time_seconds: number;
  traffic_delay_seconds: number;
  instructions: RouteInstruction[];
}
