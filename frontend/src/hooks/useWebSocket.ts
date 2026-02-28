import { useState, useEffect, useCallback, useRef } from "react";
import {
  WS_URL,
  RECONNECT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
} from "../lib/constants";
import type { WsMessage, ConnectionStatus } from "../types/ws";

interface UseWebSocketOptions {
  onMessage?: (msg: WsMessage) => void;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  lastMessage: WsMessage | null;
  send: (message: WsMessage) => void;
}

export function useWebSocket(
  options?: UseWebSocketOptions,
): UseWebSocketReturn {
  const onMessageRef = useRef<((msg: WsMessage) => void) | undefined>(
    options?.onMessage,
  );
  useEffect(() => {
    onMessageRef.current = options?.onMessage;
  }, [options?.onMessage]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const connectRef = useRef<() => void>();

  useEffect(() => {
    const doConnect = (): void => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = (): void => {
        setStatus("connected");
        attemptsRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent): void => {
        try {
          const message = JSON.parse(String(event.data)) as WsMessage;
          setLastMessage(message);
          onMessageRef.current?.(message);

          if (message.type === "Ping") {
            ws.send(JSON.stringify({ type: "Pong" }));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = (): void => {
        setStatus("disconnected");
        wsRef.current = null;

        if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay =
            RECONNECT_INTERVAL_MS * Math.pow(1.5, attemptsRef.current);
          attemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            connectRef.current?.();
          }, delay);
        }
      };

      ws.onerror = (): void => {
        // onclose fires after onerror, reconnect handled there
      };
    };

    connectRef.current = doConnect;
    doConnect();

    return (): void => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((message: WsMessage): void => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { status, lastMessage, send };
}
