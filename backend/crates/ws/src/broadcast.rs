use tokio::sync::broadcast;

use crate::messages::WsMessage;

const DEFAULT_CAPACITY: usize = 128;

/// Thin wrapper around a `tokio::broadcast` channel so every
/// WebSocket connection can receive server-pushed events.
#[derive(Debug, Clone)]
pub struct Broadcaster {
    sender: broadcast::Sender<WsMessage>,
}

impl Broadcaster {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Subscribe to the broadcast stream.
    /// Each subscriber receives its own copy of every message
    /// sent after the subscription is created.
    pub fn subscribe(&self) -> broadcast::Receiver<WsMessage> {
        self.sender.subscribe()
    }

    /// Broadcast a message to all active subscribers.
    /// Returns the number of receivers that will get the message.
    /// A count of zero is not an error -- it means nobody is listening.
    pub fn send(&self, msg: WsMessage) -> usize {
        // `send` returns Err only when there are zero receivers,
        // which is a normal state during startup or idle periods.
        self.sender.send(msg).unwrap_or(0)
    }
}

impl Default for Broadcaster {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}
