use anyhow::Context;
use bus::{topics, BusEnvelope};
use rdkafka::{
    consumer::{CommitMode, Consumer, StreamConsumer},
    message::{BorrowedMessage, Message},
};
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

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

    let consumer: StreamConsumer = rdkafka::ClientConfig::new()
        .set("bootstrap.servers", &broker)
        .set("group.id", &group_id)
        .set("enable.partition.eof", "false")
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest")
        .create()
        .context("failed to create redis stream consumer")?;

    consumer.subscribe(&topics::ALL_TOPICS)?;

    info!(broker = %broker, group_id = %group_id, "consumer_redis started");

    loop {
        let msg = match consumer.recv().await {
            Ok(msg) => msg,
            Err(error) => {
                warn!(error = %error, "failed to receive bus message");
                continue;
            }
        };

        if let Err(error) = process_message(&redis_pool, &msg).await {
            error!(topic = %msg.topic(), error = %error, "failed to handle bus message");
            continue;
        }

        if let Err(error) = consumer.commit_message(&msg, CommitMode::Async) {
            warn!(topic = %msg.topic(), error = %error, "failed to commit offset");
        }
    }
}

async fn process_message(pool: &cache::RedisPool, msg: &BorrowedMessage<'_>) -> anyhow::Result<()> {
    let topic = msg.topic();
    let payload = msg.payload().context("empty payload")?;
    let envelope = BusEnvelope::decode_from_slice(payload)?;

    match topic {
        topics::AIRCRAFT => {
            let data: Vec<services::aircraft::Aircraft> =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode aircraft payload")?;
            cache::aircraft::set_aircraft(pool, &data).await?;
        }
        topics::CAMERAS => {
            let data: Vec<cameras::Camera> = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode cameras payload")?;
            cache::cameras::set_cameras(pool, &data).await?;
        }
        topics::WEATHER => {
            let data: weather::WeatherGrid = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode weather payload")?;
            cache::weather::set_weather(pool, &data).await?;
        }
        topics::METAR => {
            let data: Vec<ws::messages::MetarStation> =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode metar payload")?;
            cache::metar::set_metar(pool, &data).await?;
        }
        topics::SATELLITES => {
            let data: Vec<satellites::Satellite> =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode satellites payload")?;
            cache::satellites::set_satellites(pool, &data).await?;
        }
        topics::EVENTS => {
            let data: events::EventsResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode events payload")?;
            cache::events::set_events(pool, &data).await?;
        }
        topics::SEISMIC => {
            let data: seismic::SeismicResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode seismic payload")?;
            cache::seismic::set_seismic(pool, &data).await?;
        }
        topics::FIRES => {
            let data: fires::FiresResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode fires payload")?;
            cache::fires::set_fires(pool, &data).await?;
        }
        topics::GDELT => {
            let data: gdelt::GdeltResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode gdelt payload")?;
            cache::gdelt::set_gdelt(pool, &data).await?;
        }
        topics::MARITIME => {
            let data: maritime::MaritimeResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode maritime payload")?;
            cache::maritime::set_maritime(pool, &data).await?;
        }
        topics::CYBER => {
            let data: cyber::CyberResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode cyber payload")?;
            cache::cyber::set_cyber(pool, &data).await?;
        }
        topics::SPACE_WEATHER => {
            let data: space_weather::SpaceWeatherResponse =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode space_weather payload")?;
            cache::space_weather::set_space_weather(pool, &data).await?;
        }
        topics::CABLES => {
            let data: cables::CablesResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode cables payload")?;
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
