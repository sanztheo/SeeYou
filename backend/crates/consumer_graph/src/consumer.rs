use std::{collections::hash_map::DefaultHasher, hash::Hasher};

use anyhow::Context;
use bus::{topics, BusEnvelope};
use rdkafka::{
    consumer::{CommitMode, Consumer, StreamConsumer},
    message::Message,
};
use serde_json::Value;
use tracing::{info, warn};

pub struct GraphBusConsumer {
    client: graph::GraphClient,
    consumer: StreamConsumer,
}

impl GraphBusConsumer {
    pub fn new(client: graph::GraphClient, consumer: StreamConsumer) -> Self {
        Self { client, consumer }
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

        consumer.subscribe(&topics::ALL_TOPICS)?;
        Ok(Self::new(client, consumer))
    }

    pub async fn handle_envelope(&self, envelope: BusEnvelope) -> anyhow::Result<()> {
        let payload: Value = serde_json::from_slice(&envelope.payload_json).unwrap_or_else(|_| {
            Value::String(String::from_utf8_lossy(&envelope.payload_json).to_string())
        });
        let records = extract_records_for_topic(&envelope.topic, &payload);
        for (table, entity_payload) in records {
            let entity_id = resolve_entity_id(table, None, &entity_payload);
            graph::entities::upsert(&self.client, table, &entity_id, entity_payload.clone())
                .await?;

            for zone_id in resolve_zone_ids(&entity_payload) {
                graph::relations::link(
                    &self.client,
                    table,
                    &entity_id,
                    "located_in",
                    "zone",
                    &zone_id,
                    None,
                )
                .await?;
            }

            info!(
                topic = %envelope.topic,
                table,
                entity_id = %entity_id,
                "graph entity upserted from bus envelope"
            );
        }
        Ok(())
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        loop {
            let msg = match self.consumer.recv().await {
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
    }
}

fn values_from_key(payload: &Value, key: &str) -> Vec<Value> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.to_vec())
        .unwrap_or_default()
}

fn extract_entities(payload: &Value, key: &str) -> Vec<Value> {
    if let Some(items) = payload.as_array() {
        return items.to_vec();
    }

    let by_key = values_from_key(payload, key);
    if !by_key.is_empty() {
        return by_key;
    }

    vec![payload.clone()]
}

fn extract_records_for_topic(topic: &str, payload: &Value) -> Vec<(&'static str, Value)> {
    match topic {
        topics::AIRCRAFT => extract_entities(payload, "aircraft")
            .into_iter()
            .map(|v| ("aircraft", v))
            .collect(),
        topics::CAMERAS => extract_entities(payload, "cameras")
            .into_iter()
            .map(|v| ("camera", v))
            .collect(),
        topics::TRAFFIC => extract_entities(payload, "segments")
            .into_iter()
            .map(|v| ("traffic_segment", v))
            .collect(),
        topics::WEATHER => extract_entities(payload, "points")
            .into_iter()
            .map(|v| ("weather", v))
            .collect(),
        topics::METAR => extract_entities(payload, "stations")
            .into_iter()
            .map(|v| ("weather", v))
            .collect(),
        topics::SATELLITES => extract_entities(payload, "satellites")
            .into_iter()
            .map(|v| ("satellite", v))
            .collect(),
        topics::EVENTS => extract_entities(payload, "events")
            .into_iter()
            .map(|v| ("event", v))
            .collect(),
        topics::SEISMIC => extract_entities(payload, "earthquakes")
            .into_iter()
            .map(|v| ("seismic_event", v))
            .collect(),
        topics::FIRES => extract_entities(payload, "fires")
            .into_iter()
            .map(|v| ("fire_hotspot", v))
            .collect(),
        topics::GDELT => extract_entities(payload, "events")
            .into_iter()
            .map(|v| ("gdelt_event", v))
            .collect(),
        topics::MARITIME => extract_entities(payload, "vessels")
            .into_iter()
            .map(|v| ("vessel", v))
            .collect(),
        topics::CYBER => extract_entities(payload, "threats")
            .into_iter()
            .map(|v| ("cyber_threat", v))
            .collect(),
        topics::SPACE_WEATHER => {
            let mut out = Vec::new();
            out.extend(
                values_from_key(payload, "aurora")
                    .into_iter()
                    .map(|v| ("aurora_point", v)),
            );
            out.extend(
                values_from_key(payload, "alerts")
                    .into_iter()
                    .map(|v| ("space_weather_alert", v)),
            );
            if out.is_empty() {
                out.extend(
                    extract_entities(payload, "alerts")
                        .into_iter()
                        .map(|v| ("space_weather_event", v)),
                );
            }
            out
        }
        topics::CABLES => {
            let mut out = Vec::new();
            out.extend(
                values_from_key(payload, "cables")
                    .into_iter()
                    .map(|v| ("cable", v)),
            );
            out.extend(
                values_from_key(payload, "landing_points")
                    .into_iter()
                    .map(|v| ("landing_point", v)),
            );
            if out.is_empty() {
                out.extend(
                    extract_entities(payload, "cables")
                        .into_iter()
                        .map(|v| ("cable", v)),
                );
            }
            out
        }
        topics::MILITARY_BASES => extract_entities(payload, "bases")
            .into_iter()
            .map(|v| ("military_base", v))
            .collect(),
        topics::NUCLEAR_SITES => extract_entities(payload, "sites")
            .into_iter()
            .map(|v| ("nuclear_site", v))
            .collect(),
        _ => Vec::new(),
    }
}

fn resolve_entity_id(table: &str, key: Option<&str>, payload: &Value) -> String {
    if let Some(key) = key.filter(|k| !k.is_empty()) {
        return key.to_string();
    }

    let candidates = [
        "id",
        "icao",
        "icao24",
        "hex",
        "segment_id",
        "station_id",
        "mmsi",
        "norad_id",
        "event_id",
    ];

    for candidate in candidates {
        if let Some(value) = payload.get(candidate) {
            if let Some(as_str) = value.as_str() {
                if !as_str.is_empty() {
                    return as_str.to_string();
                }
            }
            if let Some(as_u64) = value.as_u64() {
                return as_u64.to_string();
            }
            if let Some(as_i64) = value.as_i64() {
                return as_i64.to_string();
            }
        }
    }

    let mut hasher = DefaultHasher::new();
    hasher.write(format!("{table}:{payload}").as_bytes());
    format!("{}_{}", table, hasher.finish())
}

fn resolve_zone_ids(payload: &Value) -> Vec<String> {
    let mut zone_ids = Vec::new();

    if let Some(zone_id) = payload.get("zone_id").and_then(Value::as_str) {
        zone_ids.push(zone_id.to_string());
    }

    if let Some(located_in) = payload.get("located_in").and_then(Value::as_str) {
        zone_ids.push(located_in.to_string());
    }

    if let Some(values) = payload.get("zone_ids").and_then(Value::as_array) {
        for value in values {
            if let Some(zone_id) = value.as_str() {
                zone_ids.push(zone_id.to_string());
            }
        }
    }

    zone_ids.sort();
    zone_ids.dedup();
    zone_ids
}
