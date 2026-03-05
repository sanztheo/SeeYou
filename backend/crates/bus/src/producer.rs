use anyhow::{Context, Result};
use rdkafka::producer::{FutureProducer, FutureRecord, Producer};
use rdkafka::ClientConfig;
use std::time::Duration;
use tracing::warn;

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
        let producer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .create()
            .context("failed to create kafka producer")?;

        Ok(Self {
            producer,
            enabled,
            fallback_mode,
        })
    }

    pub async fn send_envelope(&self, envelope: &BusEnvelope) -> Result<()> {
        if !self.enabled {
            self.handle_fallback(envelope)?;
            anyhow::bail!("bus disabled")
        }

        let payload = envelope.encode_to_vec();
        let key = envelope.event_id.as_bytes();

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
