import type { AircraftPosition } from "./aircraft";

export type WsMessageType =
  | "Connected"
  | "Ping"
  | "Pong"
  | "Error"
  | "AircraftUpdate"
  | "AircraftBatch";

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

export type WsMessage =
  | WsConnected
  | WsPing
  | WsPong
  | WsError
  | WsAircraftUpdate
  | WsAircraftBatch;

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
