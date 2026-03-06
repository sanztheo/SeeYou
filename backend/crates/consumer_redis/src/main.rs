use std::{
    collections::{BTreeMap, HashMap},
    time::{Duration, Instant},
};

use anyhow::Context;
use bus::{topics, BusEnvelope};
use rdkafka::{
    consumer::{CommitMode, Consumer, StreamConsumer},
    message::{BorrowedMessage, Message},
};
use serde_json::{Map, Value};
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

const CHUNK_REASSEMBLY_TTL: Duration = Duration::from_secs(120);

#[derive(Default)]
struct ChunkReassembler {
    pending: HashMap<(String, String), PendingPayload>,
}

struct PendingPayload {
    total_chunks: usize,
    updated_at: Instant,
    chunks: BTreeMap<usize, Vec<Value>>,
    extra_fields: Option<Map<String, Value>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into());
    let broker = bus::resolve_brokers_from_env();
    let group_id =
        std::env::var("REDIS_CONSUMER_GROUP").unwrap_or_else(|_| "redis-consumer".into());

    let redis_pool = cache::create_pool(&redis_url)?;

    let mut config = rdkafka::ClientConfig::new();
    config
        .set("bootstrap.servers", &broker)
        .set("group.id", &group_id)
        .set("enable.partition.eof", "false")
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest");
    bus::apply_kafka_security_from_env(&mut config);

    let consumer: StreamConsumer = config
        .create()
        .context("failed to create redis stream consumer")?;

    consumer.subscribe(&topics::ALL_TOPICS)?;

    info!(broker = %broker, group_id = %group_id, "consumer_redis started");

    let mut chunk_reassembler = ChunkReassembler::default();

    loop {
        let msg = match consumer.recv().await {
            Ok(msg) => msg,
            Err(error) => {
                warn!(error = %error, "failed to receive bus message");
                continue;
            }
        };

        if let Err(error) = process_message(&redis_pool, &mut chunk_reassembler, &msg).await {
            error!(topic = %msg.topic(), error = %error, "failed to handle bus message");
            continue;
        }

        if let Err(error) = consumer.commit_message(&msg, CommitMode::Async) {
            warn!(topic = %msg.topic(), error = %error, "failed to commit offset");
        }
    }
}

async fn process_message(
    pool: &cache::RedisPool,
    chunk_reassembler: &mut ChunkReassembler,
    msg: &BorrowedMessage<'_>,
) -> anyhow::Result<()> {
    let topic = msg.topic();
    let payload = msg.payload().context("empty payload")?;
    let envelope = BusEnvelope::decode_from_slice(payload)?;
    let Some(payload_json) = chunk_reassembler.ingest(topic, &envelope)? else {
        return Ok(());
    };

    match topic {
        topics::AIRCRAFT => {
            let data: Vec<services::aircraft::Aircraft> = serde_json::from_slice(&payload_json)
                .context("failed to decode aircraft payload")?;
            cache::aircraft::set_aircraft(pool, &data).await?;
        }
        topics::CAMERAS => {
            let data: Vec<cameras::Camera> = serde_json::from_slice(&payload_json)
                .context("failed to decode cameras payload")?;
            cache::cameras::set_cameras(pool, &data).await?;
        }
        topics::WEATHER => {
            let data: weather::WeatherGrid = serde_json::from_slice(&payload_json)
                .context("failed to decode weather payload")?;
            cache::weather::set_weather(pool, &data).await?;
        }
        topics::METAR => {
            let data: Vec<ws::messages::MetarStation> =
                serde_json::from_slice(&payload_json).context("failed to decode metar payload")?;
            cache::metar::set_metar(pool, &data).await?;
        }
        topics::SATELLITES => {
            let data: Vec<satellites::Satellite> = serde_json::from_slice(&payload_json)
                .context("failed to decode satellites payload")?;
            cache::satellites::set_satellites(pool, &data).await?;
        }
        topics::EVENTS => {
            let data: events::EventsResponse =
                serde_json::from_slice(&payload_json).context("failed to decode events payload")?;
            cache::events::set_events(pool, &data).await?;
        }
        topics::SEISMIC => {
            let data: seismic::SeismicResponse = serde_json::from_slice(&payload_json)
                .context("failed to decode seismic payload")?;
            cache::seismic::set_seismic(pool, &data).await?;
        }
        topics::FIRES => {
            let data: fires::FiresResponse =
                serde_json::from_slice(&payload_json).context("failed to decode fires payload")?;
            cache::fires::set_fires(pool, &data).await?;
        }
        topics::GDELT => {
            let data: gdelt::GdeltResponse =
                serde_json::from_slice(&payload_json).context("failed to decode gdelt payload")?;
            cache::gdelt::set_gdelt(pool, &data).await?;
        }
        topics::MARITIME => {
            let data: maritime::MaritimeResponse = serde_json::from_slice(&payload_json)
                .context("failed to decode maritime payload")?;
            cache::maritime::set_maritime(pool, &data).await?;
        }
        topics::CYBER => {
            let data: cyber::CyberResponse =
                serde_json::from_slice(&payload_json).context("failed to decode cyber payload")?;
            cache::cyber::set_cyber(pool, &data).await?;
        }
        topics::SPACE_WEATHER => {
            let data: space_weather::SpaceWeatherResponse =
                serde_json::from_slice(&payload_json)
                    .context("failed to decode space_weather payload")?;
            cache::space_weather::set_space_weather(pool, &data).await?;
        }
        topics::CABLES => {
            let data: cables::CablesResponse =
                serde_json::from_slice(&payload_json).context("failed to decode cables payload")?;
            cache::cables::set_cables(pool, &data).await?;
        }
        topics::TRAFFIC | topics::MILITARY_BASES | topics::NUCLEAR_SITES => {
            // No canonical fixed Redis key exists yet for these bus payloads.
            // They remain available via downstream DB/graph consumers.
        }
        other => {
            warn!(topic = %other, "unsupported topic skipped");
        }
    }

    Ok(())
}

impl ChunkReassembler {
    fn ingest(&mut self, topic: &str, envelope: &BusEnvelope) -> anyhow::Result<Option<Vec<u8>>> {
        self.pending
            .retain(|_, pending| pending.updated_at.elapsed() < CHUNK_REASSEMBLY_TTL);

        let (_, chunk_info) = bus::parse_chunked_source(&envelope.source);
        let Some(chunk_info) = chunk_info else {
            return Ok(Some(envelope.payload_json.clone()));
        };

        if !matches!(
            topic,
            topics::AIRCRAFT | topics::CAMERAS | topics::SATELLITES | topics::FIRES
        ) {
            return Ok(Some(envelope.payload_json.clone()));
        }

        let payload: Value = serde_json::from_slice(&envelope.payload_json)
            .context("failed to decode chunk payload for reassembly")?;
        let (items, extra_fields) = extract_chunk_payload(topic, payload)?;
        let key = (topic.to_string(), chunk_info.chunk_id.clone());
        let pending = self
            .pending
            .entry(key.clone())
            .or_insert_with(|| PendingPayload {
                total_chunks: chunk_info.total_chunks,
                updated_at: Instant::now(),
                chunks: BTreeMap::new(),
                extra_fields: extra_fields.clone(),
            });

        pending.total_chunks = chunk_info.total_chunks;
        pending.updated_at = Instant::now();
        pending.chunks.insert(chunk_info.chunk_index, items);
        if pending.extra_fields.is_none() {
            pending.extra_fields = extra_fields;
        }

        if pending.chunks.len() < pending.total_chunks {
            return Ok(None);
        }

        let pending = self
            .pending
            .remove(&key)
            .context("missing completed chunk assembly")?;
        let payload = assemble_chunk_payload(topic, pending)?;
        let payload_json =
            serde_json::to_vec(&payload).context("failed to encode reassembled payload")?;
        Ok(Some(payload_json))
    }
}

fn extract_chunk_payload(
    topic: &str,
    payload: Value,
) -> anyhow::Result<(Vec<Value>, Option<Map<String, Value>>)> {
    match topic {
        topics::AIRCRAFT | topics::CAMERAS | topics::SATELLITES => {
            let items = payload
                .as_array()
                .cloned()
                .context("expected array payload for chunked topic")?;
            Ok((items, None))
        }
        topics::FIRES => {
            let mut object = payload
                .as_object()
                .cloned()
                .context("expected object payload for fires chunk")?;
            let items = object
                .remove("fires")
                .and_then(|value| value.as_array().cloned())
                .context("expected fires array for fires chunk")?;
            Ok((items, Some(object)))
        }
        _ => Ok((vec![payload], None)),
    }
}

fn assemble_chunk_payload(topic: &str, pending: PendingPayload) -> anyhow::Result<Value> {
    let mut merged = Vec::new();
    for (_, chunk) in pending.chunks {
        merged.extend(chunk);
    }

    match topic {
        topics::AIRCRAFT | topics::CAMERAS | topics::SATELLITES => Ok(Value::Array(merged)),
        topics::FIRES => {
            let mut object = pending.extra_fields.unwrap_or_default();
            object.insert("fires".to_string(), Value::Array(merged));
            Ok(Value::Object(object))
        }
        _ => anyhow::bail!("unsupported chunked topic: {topic}"),
    }
}
