export type WsMessageType = "Connected" | "Ping" | "Pong" | "Error";

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

export type WsMessage = WsConnected | WsPing | WsPong | WsError;

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
