use std::sync::Arc;

use tokio::sync::broadcast;

use crate::messages::WsMessage;

const DEFAULT_CAPACITY: usize = 128;

/// Thin wrapper around a `tokio::broadcast` channel so every
/// WebSocket connection can receive server-pushed events.
///
/// The channel carries an `Arc<str>` of already-encoded JSON rather than
/// the `WsMessage` itself: `send` serializes once, and every subscriber's
/// `recv` clone is an atomic refcount bump instead of a full re-serialize
/// (was O(clients) re-serialization in `ws::handler`, now O(1)).
#[derive(Debug, Clone)]
pub struct Broadcaster {
    sender: broadcast::Sender<Arc<str>>,
}

impl Broadcaster {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Subscribe to the broadcast stream.
    /// Each subscriber receives its own clone of the same encoded
    /// frame for every message sent after the subscription is created.
    pub fn subscribe(&self) -> broadcast::Receiver<Arc<str>> {
        self.sender.subscribe()
    }

    /// Encode a message to JSON once and broadcast the shared frame to
    /// all active subscribers. Returns the number of receivers that will
    /// get the message. A count of zero is not an error -- it means
    /// nobody is listening.
    pub fn send(&self, msg: WsMessage) -> usize {
        let Ok(json) = serde_json::to_string(&msg) else {
            return 0;
        };
        let frame: Arc<str> = Arc::from(json);
        // `send` returns Err only when there are zero receivers,
        // which is a normal state during startup or idle periods.
        self.sender.send(frame).unwrap_or(0)
    }
}

impl Default for Broadcaster {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_encodes_once_and_shares_the_frame_across_subscribers() {
        let broadcaster = Broadcaster::new(8);
        let mut sub1 = broadcaster.subscribe();
        let mut sub2 = broadcaster.subscribe();

        let receivers = broadcaster.send(WsMessage::Ping);
        assert_eq!(receivers, 2);

        let frame1 = sub1.try_recv().unwrap();
        let frame2 = sub2.try_recv().unwrap();

        // Same allocation reused across subscribers: proof the JSON encode
        // happened exactly once in `send`, not once per socket.
        assert!(Arc::ptr_eq(&frame1, &frame2));
        assert!(matches!(
            serde_json::from_str::<WsMessage>(&frame1).unwrap(),
            WsMessage::Ping
        ));
    }

    #[test]
    fn send_with_no_subscribers_returns_zero() {
        let broadcaster = Broadcaster::new(8);
        assert_eq!(broadcaster.send(WsMessage::Ping), 0);
    }
}
