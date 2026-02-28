use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use tracing::{info, warn};

use crate::{broadcast::Broadcaster, messages::WsMessage};

/// Axum handler that upgrades an HTTP request to a WebSocket connection.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(broadcaster): State<Broadcaster>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, broadcaster))
}

/// Serialize a `WsMessage` into a text frame, returning `None`
/// if serialization fails so callers can skip rather than crash.
fn encode_message(msg: &WsMessage) -> Option<Message> {
    serde_json::to_string(msg)
        .ok()
        .map(Message::Text)
}

/// Core per-connection loop. Splits the socket into read/write halves
/// and uses `tokio::select!` to handle inbound frames and broadcast
/// events concurrently.
async fn handle_socket(socket: WebSocket, broadcaster: Broadcaster) {
    let client_id = uuid::Uuid::new_v4().to_string();
    info!(client_id = %client_id, "websocket client connected");

    let (mut sink, mut stream) = socket.split();

    // Greet the client with its unique id.
    let connected = WsMessage::Connected {
        client_id: client_id.clone(),
    };
    if let Some(frame) = encode_message(&connected) {
        if sink.send(frame).await.is_err() {
            warn!(client_id = %client_id, "failed to send connected message, dropping");
            return;
        }
    }

    let mut broadcast_rx = broadcaster.subscribe();

    loop {
        tokio::select! {
            // Inbound frame from this client.
            maybe_msg = stream.next() => {
                match maybe_msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_incoming_text(&text, &mut sink, &client_id).await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        info!(client_id = %client_id, "websocket client disconnected");
                        break;
                    }
                    Some(Err(e)) => {
                        warn!(client_id = %client_id, error = %e, "websocket receive error");
                        break;
                    }
                    // Binary / Ping / Pong frames handled by axum internally.
                    Some(Ok(_)) => {}
                }
            }

            // Outbound broadcast message.
            result = broadcast_rx.recv() => {
                match result {
                    Ok(msg) => {
                        if let Some(frame) = encode_message(&msg) {
                            if sink.send(frame).await.is_err() {
                                warn!(client_id = %client_id, "failed to forward broadcast, dropping");
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        warn!(client_id = %client_id, skipped = n, "broadcast receiver lagged");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }
}

/// Parse an inbound text frame and respond when appropriate.
async fn handle_incoming_text(
    text: &str,
    sink: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    client_id: &str,
) {
    let parsed: Result<WsMessage, _> = serde_json::from_str(text);

    match parsed {
        Ok(WsMessage::Ping) => {
            if let Some(frame) = encode_message(&WsMessage::Pong) {
                if sink.send(frame).await.is_err() {
                    warn!(client_id = %client_id, "failed to send pong");
                }
            }
        }
        Ok(_) => {
            // Other valid message types are acknowledged but not acted on yet.
        }
        Err(e) => {
            warn!(client_id = %client_id, error = %e, "invalid ws message from client");
            let err_msg = WsMessage::Error {
                message: "invalid message format".into(),
            };
            if let Some(frame) = encode_message(&err_msg) {
                let _ = sink.send(frame).await;
            }
        }
    }
}
