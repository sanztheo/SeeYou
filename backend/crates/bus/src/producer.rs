use anyhow::{Context, Result};
use rdkafka::producer::{FutureProducer, FutureRecord, Producer};
use rdkafka::ClientConfig;
use std::time::Duration;
use tracing::warn;

use crate::chunking::{format_chunked_source, new_chunk_id, BusChunkInfo};
use crate::config::BusFallbackMode;
use crate::envelope::BusEnvelope;

#[derive(Clone)]
pub struct BusProducer {
    producer: FutureProducer,
    enabled: bool,
    fallback_mode: BusFallbackMode,
}

impl BusProducer {
    pub fn new(brokers: &str, enabled: bool, fallback_mode: BusFallbackMode) -> Result<Self> {
        let mut config = ClientConfig::new();
        config
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000");
        crate::config::apply_kafka_security_from_env(&mut config);

        let producer = config.create().context("failed to create kafka producer")?;

        Ok(Self {
            producer,
            enabled,
            fallback_mode,
        })
    }

    pub async fn send_envelope(&self, envelope: &BusEnvelope) -> Result<()> {
        let key = envelope.event_id.clone();
        self.send_envelope_with_key(envelope, &key).await
    }

    pub async fn send_envelope_with_key(&self, envelope: &BusEnvelope, key: &str) -> Result<()> {
        if !self.enabled {
            self.handle_fallback(envelope)?;
            anyhow::bail!("bus disabled")
        }

        let payload = envelope.encode_to_vec();

        self.producer
            .send(
                FutureRecord::to(&envelope.topic).key(key).payload(&payload),
                Duration::from_secs(5),
            )
            .await
            .map_err(|(error, _)| error)
            .context("failed to publish bus envelope")?;

        Ok(())
    }

    pub async fn send_json_slices<T>(
        &self,
        source: &str,
        topic: &str,
        items: &[T],
        chunk_size: usize,
    ) -> Result<usize>
    where
        T: serde::Serialize,
    {
        let chunk_size = chunk_size.max(1);
        if items.is_empty() {
            let envelope = BusEnvelope::new_json("1", source, topic, items)?;
            self.send_envelope(&envelope).await?;
            return Ok(1);
        }

        let total_chunks = items.len().div_ceil(chunk_size);
        let chunk_id = new_chunk_id();

        for (chunk_index, chunk) in items.chunks(chunk_size).enumerate() {
            let source = if total_chunks > 1 {
                let chunk_info = BusChunkInfo::new(chunk_id.clone(), chunk_index, total_chunks);
                format_chunked_source(source, &chunk_info)
            } else {
                source.to_string()
            };

            let envelope = BusEnvelope::new_json("1", source, topic, chunk)?;
            let key = if total_chunks > 1 {
                chunk_id.as_str()
            } else {
                envelope.event_id.as_str()
            };
            self.send_envelope_with_key(&envelope, key).await?;
        }

        Ok(total_chunks)
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub fn broker_connected(&self, timeout: Duration) -> bool {
        if !self.enabled {
            return false;
        }

        self.producer.client().fetch_metadata(None, timeout).is_ok()
    }

    fn handle_fallback(&self, envelope: &BusEnvelope) -> Result<()> {
        if matches!(
            self.fallback_mode,
            BusFallbackMode::Log | BusFallbackMode::RedisPostgres
        ) {
            warn!(
                topic = %envelope.topic,
                event_id = %envelope.event_id,
                "bus disabled, event not published"
            );
        }

        Ok(())
    }
}
