import type { AircraftPosition, PredictedTrajectory } from "./aircraft";
import type { SatellitePosition } from "./satellite";

export type WsMessageType =
  | "Connected"
  | "Ping"
  | "Pong"
  | "Error"
  | "AircraftUpdate"
  | "AircraftBatch"
  | "Predictions"
  | "SatelliteBatch";

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

export type WsMessage =
  | WsConnected
  | WsPing
  | WsPong
  | WsError
  | WsAircraftUpdate
  | WsAircraftBatch
  | WsPredictions
  | WsSatelliteBatch;

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
