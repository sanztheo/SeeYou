use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use anyhow::Context;
use bus::{topics, BusEnvelope};
use rdkafka::{
    consumer::{CommitMode, Consumer, StreamConsumer},
    message::Message,
};
use serde_json::Value;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::{
    constants::{
        DEFAULT_FLIES_OVER_TTL_SECONDS, DEFAULT_NEAREST_ZONE_MAX_DISTANCE_KM,
        DEFAULT_RELATION_SWEEP_INTERVAL_SECONDS, DEFAULT_TABLE_CACHE_TTL_MS,
    },
    payload::extract_records_for_topic,
};

const RELATION_TABLES_WITH_TTL: &[&str] = &["flies_over", "monitored_by", "affected_by"];

#[derive(Clone, Debug)]
pub(crate) struct TableCacheEntry {
    pub(crate) loaded_at: Instant,
    pub(crate) records: Vec<Value>,
}

pub struct GraphBusConsumer {
    pub(crate) client: graph::GraphClient,
    consumer: StreamConsumer,
    pub(crate) zone_lookup: graph::zones::ZoneLookup,
    pub(crate) flies_over_ttl_seconds: i64,
    pub(crate) nearest_zone_max_distance_m: f64,
    relation_sweep_interval: Duration,
    pub(crate) table_cache_ttl: Duration,
    pub(crate) table_cache: RwLock<HashMap<String, TableCacheEntry>>,
}

impl GraphBusConsumer {
    pub fn new(
        client: graph::GraphClient,
        consumer: StreamConsumer,
        zone_lookup: graph::zones::ZoneLookup,
        flies_over_ttl_seconds: i64,
        nearest_zone_max_distance_m: f64,
        relation_sweep_interval: Duration,
        table_cache_ttl: Duration,
    ) -> Self {
        Self {
            client,
            consumer,
            zone_lookup,
            flies_over_ttl_seconds,
            nearest_zone_max_distance_m,
            relation_sweep_interval,
            table_cache_ttl,
            table_cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn from_env(client: graph::GraphClient) -> anyhow::Result<Self> {
        let brokers = bus::resolve_brokers_from_env();
        let group_id =
            std::env::var("GRAPH_CONSUMER_GROUP").unwrap_or_else(|_| "graph-consumer".to_string());

        let consumer: StreamConsumer = rdkafka::ClientConfig::new()
            .set("bootstrap.servers", &brokers)
            .set("group.id", &group_id)
            .set("enable.partition.eof", "false")
            .set("enable.auto.commit", "false")
            .set("auto.offset.reset", "earliest")
            .create()
            .with_context(|| format!("failed to create graph consumer for brokers={brokers}"))?;

        let zones_path = std::env::var("GRAPH_ZONES_FILE")
            .unwrap_or_else(|_| "data/zones/global_zones.geojson".to_string());
        let zone_lookup = graph::zones::ZoneLookup::from_geojson_path(&zones_path)
            .with_context(|| format!("failed to load zone lookup from {zones_path}"))?;

        let flies_over_ttl_seconds = parse_env_i64(
            "GRAPH_FLIES_OVER_TTL_SECONDS",
            DEFAULT_FLIES_OVER_TTL_SECONDS,
        )
        .max(1);
        let relation_sweep_interval = Duration::from_secs(parse_env_u64(
            "GRAPH_RELATION_SWEEP_INTERVAL_SECONDS",
            DEFAULT_RELATION_SWEEP_INTERVAL_SECONDS,
        ));
        let nearest_zone_max_distance_km = parse_env_f64(
            "GRAPH_NEAREST_ZONE_MAX_DISTANCE_KM",
            DEFAULT_NEAREST_ZONE_MAX_DISTANCE_KM,
        )
        .max(0.0);
        let table_cache_ttl = Duration::from_millis(parse_env_u64(
            "GRAPH_TABLE_CACHE_TTL_MS",
            DEFAULT_TABLE_CACHE_TTL_MS,
        ));

        info!(
            zones = zone_lookup.len(),
            flies_over_ttl_seconds,
            nearest_zone_max_distance_km,
            sweep_interval_seconds = relation_sweep_interval.as_secs(),
            table_cache_ttl_ms = table_cache_ttl.as_millis(),
            "graph consumer geo-relation settings loaded"
        );

        consumer.subscribe(&topics::ALL_TOPICS)?;
        Ok(Self::new(
            client,
            consumer,
            zone_lookup,
            flies_over_ttl_seconds,
            nearest_zone_max_distance_km * 1_000.0,
            relation_sweep_interval,
            table_cache_ttl,
        ))
    }

    pub async fn handle_envelope(&self, envelope: BusEnvelope) -> anyhow::Result<()> {
        let payload: Value = serde_json::from_slice(&envelope.payload_json).unwrap_or_else(|_| {
            Value::String(String::from_utf8_lossy(&envelope.payload_json).to_string())
        });

        let records = extract_records_for_topic(&envelope.topic, &payload);
        for (table, entity_payload) in records {
            self.process_entity(table, &entity_payload, &envelope.topic)
                .await?;
        }

        Ok(())
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let sweep_enabled = !self.relation_sweep_interval.is_zero();
        let mut sweep_interval = tokio::time::interval(if sweep_enabled {
            self.relation_sweep_interval
        } else {
            Duration::from_secs(3600)
        });
        sweep_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let _ = sweep_interval.tick().await;

        loop {
            tokio::select! {
                msg_result = self.consumer.recv() => {
                    let msg = match msg_result {
                        Ok(msg) => msg,
                        Err(error) => {
                            warn!(error = %error, "failed to receive graph bus message");
                            continue;
                        }
                    };

                    let payload = match msg.payload() {
                        Some(payload) => payload,
                        None => continue,
                    };

                    let envelope = match BusEnvelope::decode_from_slice(payload) {
                        Ok(envelope) => envelope,
                        Err(error) => {
                            warn!(error = %error, topic = %msg.topic(), "invalid envelope payload");
                            continue;
                        }
                    };

                    if let Err(error) = self.handle_envelope(envelope).await {
                        warn!(error = %error, topic = %msg.topic(), "failed graph consume");
                        continue;
                    }

                    if let Err(error) = self.consumer.commit_message(&msg, CommitMode::Async) {
                        warn!(error = %error, topic = %msg.topic(), "failed graph offset commit");
                    }
                }
                _ = sweep_interval.tick(), if sweep_enabled => {
                    if let Err(error) = self.sweep_expired_relations().await {
                        warn!(error = %error, "failed sweeping expired graph relations");
                    }
                }
            }
        }
    }

    async fn sweep_expired_relations(&self) -> anyhow::Result<()> {
        let removed =
            graph::relations::sweep_expired_relations(&self.client, RELATION_TABLES_WITH_TTL)
                .await?;

        if removed > 0 {
            info!(removed, "expired graph relations swept");
        }

        Ok(())
    }
}

fn parse_env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(default)
}

fn parse_env_i64(name: &str, default: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(default)
}

fn parse_env_f64(name: &str, default: f64) -> f64 {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.parse::<f64>().ok())
        .unwrap_or(default)
}
