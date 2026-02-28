use serde::{Deserialize, Serialize};

/// Wire format for all WebSocket messages.
/// The `tag` / `content` serde representation keeps the JSON shape
/// consistent: `{ "type": "Ping" }` or `{ "type": "Connected", "payload": { "client_id": "..." } }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsMessage {
    Connected { client_id: String },
    Ping,
    Pong,
    Error { message: String },
}
