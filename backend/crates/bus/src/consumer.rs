use anyhow::{Context, Result};
use futures_util::Stream;
use futures_util::StreamExt;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::error::KafkaError;
use rdkafka::message::OwnedMessage;
use rdkafka::ClientConfig;

pub struct BusConsumer {
    consumer: StreamConsumer,
}

impl BusConsumer {
    pub fn new(brokers: &str, group_id: &str) -> Result<Self> {
        let consumer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("group.id", group_id)
            .set("enable.partition.eof", "false")
            .set("auto.offset.reset", "earliest")
            .create()
            .context("failed to create kafka consumer")?;

        Ok(Self { consumer })
    }

    pub fn subscribe(&self, topics: &[&str]) -> Result<()> {
        self.consumer
            .subscribe(topics)
            .context("failed to subscribe consumer to topics")
    }

    pub fn stream(&self) -> impl Stream<Item = Result<OwnedMessage, KafkaError>> + '_ {
        self.consumer
            .stream()
            .map(|message| message.map(|value| value.detach()))
    }
}
