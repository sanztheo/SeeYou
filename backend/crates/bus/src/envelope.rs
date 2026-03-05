use anyhow::{Context, Result};
use prost::Message;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Clone, PartialEq, Message)]
pub struct BusEnvelope {
    #[prost(string, tag = "1")]
    pub schema_version: String,
    #[prost(string, tag = "2")]
    pub event_id: String,
    #[prost(string, tag = "3")]
    pub source: String,
    #[prost(string, tag = "4")]
    pub topic: String,
    #[prost(int64, tag = "5")]
    pub produced_at: i64,
    #[prost(bytes = "vec", tag = "6")]
    pub payload_json: Vec<u8>,
}

impl BusEnvelope {
    pub fn new_json<T>(
        schema_version: impl Into<String>,
        source: impl Into<String>,
        topic: impl Into<String>,
        payload: &T,
    ) -> Result<Self>
    where
        T: Serialize + ?Sized,
    {
        let payload_json =
            serde_json::to_vec(payload).context("failed to serialize envelope payload")?;

        Ok(Self {
            schema_version: schema_version.into(),
            event_id: Uuid::new_v4().to_string(),
            source: source.into(),
            topic: topic.into(),
            produced_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or_default(),
            payload_json,
        })
    }

    pub fn encode_to_vec(&self) -> Vec<u8> {
        Message::encode_to_vec(self)
    }

    pub fn decode_from_slice(data: &[u8]) -> Result<Self> {
        Self::decode(data).context("failed to decode bus envelope")
    }
}
