import type { AircraftPosition, PredictedTrajectory } from "./aircraft";
import type { MetarStation } from "./metar";
import type { SatellitePosition } from "./satellite";
import type { Earthquake } from "./seismic";
import type { GdeltEvent } from "./gdelt";
import type { AuroraPoint, SpaceWeatherAlert } from "./spaceWeather";

export type WsMessageType =
  | "Connected"
  | "Ping"
  | "Pong"
  | "Error"
  | "AircraftUpdate"
  | "AircraftBatch"
  | "Predictions"
  | "SatelliteBatch"
  | "MetarUpdate"
  | "SeismicUpdate"
  | "FireUpdate"
  | "GdeltUpdate"
  | "MaritimeUpdate"
  | "CyberThreatUpdate"
  | "SpaceWeatherUpdate"
  | "ConvergenceAlert";

export interface WsConnected {
  type: "Connected";
  payload: { client_id: string };
}

export interface WsPing {
  type: "Ping";
}

export interface WsPong {
  type: "Pong";
}

export interface WsError {
  type: "Error";
  payload: { message: string };
}

export interface WsAircraftUpdate {
  type: "AircraftUpdate";
  payload: { aircraft: AircraftPosition[] };
}

export interface WsAircraftBatch {
  type: "AircraftBatch";
  payload: {
    aircraft: AircraftPosition[];
    chunk_index: number;
    total_chunks: number;
  };
}

export interface WsPredictions {
  type: "Predictions";
  payload: { trajectories: PredictedTrajectory[] };
}

export interface WsSatelliteBatch {
  type: "SatelliteBatch";
  payload: {
    satellites: SatellitePosition[];
    chunk_index: number;
    total_chunks: number;
  };
}

export interface WsMetarUpdate {
  type: "MetarUpdate";
  payload: { stations: MetarStation[] };
}

export interface WsSeismicUpdate {
  type: "SeismicUpdate";
  payload: { earthquakes: Earthquake[] };
}

export interface WsFireUpdate {
  type: "FireUpdate";
  payload: {
    fires: {
      lat: number;
      lon: number;
      brightness: number;
      frp: number;
      confidence: string;
    }[];
  };
}

export interface WsGdeltUpdate {
  type: "GdeltUpdate";
  payload: { events: GdeltEvent[] };
}

export interface WsMaritimeUpdate {
  type: "MaritimeUpdate";
  payload: {
    vessels: {
      mmsi: string;
      name: string | null;
      vessel_type: string;
      lat: number;
      lon: number;
      heading: number | null;
      is_sanctioned: boolean;
    }[];
  };
}

export interface WsCyberThreatUpdate {
  type: "CyberThreatUpdate";
  payload: {
    threats: {
      id: string;
      threat_type: string;
      src_lat: number;
      src_lon: number;
      src_country: string | null;
      dst_lat: number | null;
      dst_lon: number | null;
      confidence: number;
    }[];
  };
}

export interface WsSpaceWeatherUpdate {
  type: "SpaceWeatherUpdate";
  payload: {
    aurora: AuroraPoint[];
    kp_index: number;
    alerts: SpaceWeatherAlert[];
  };
}

export interface WsConvergenceAlert {
  type: "ConvergenceAlert";
  payload: {
    zones: {
      lat: number;
      lon: number;
      radius_km: number;
      layers: string[];
      severity: string;
      description: string;
    }[];
  };
}

export type WsMessage =
  | WsConnected
  | WsPing
  | WsPong
  | WsError
  | WsAircraftUpdate
  | WsAircraftBatch
  | WsPredictions
  | WsSatelliteBatch
  | WsMetarUpdate
  | WsSeismicUpdate
  | WsFireUpdate
  | WsGdeltUpdate
  | WsMaritimeUpdate
  | WsCyberThreatUpdate
  | WsSpaceWeatherUpdate
  | WsConvergenceAlert;

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
