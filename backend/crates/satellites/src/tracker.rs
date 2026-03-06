use std::time::{Duration, Instant};

use cache::pool::RedisPool;
use ws::broadcast::Broadcaster;
use ws::messages::{SatellitePosition, WsMessage};

use crate::celestrak;
use crate::propagator;
use crate::types::TleData;

/// Cesium/frontend cap for satellite entities.
const MAX_SATELLITES: usize = 10_000;

/// Satellites per WebSocket message chunk.
const WS_CHUNK_SIZE: usize = 2_000;
const BUS_CHUNK_SIZE: usize = 500;

/// TLE data changes slowly — re-fetch only every 6 hours.
const TLE_CACHE_DURATION: Duration = Duration::from_secs(6 * 3600);

pub async fn run_satellite_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
    pg_pool: Option<db::PgPool>,
    bus_producer: Option<bus::BusProducer>,
    broadcaster: Broadcaster,
    poll_interval: Duration,
) {
    tracing::info!(
        "satellite tracker started, polling every {}s",
        poll_interval.as_secs()
    );

    let mut tle_cache: Vec<TleData> = Vec::new();
    let mut tle_fetched_at = Instant::now() - TLE_CACHE_DURATION;

    loop {
        if tle_fetched_at.elapsed() >= TLE_CACHE_DURATION || tle_cache.is_empty() {
            let (tles, total, failed) = celestrak::fetch_all_tle(&client).await;
            tracing::info!(
                total_tles = tles.len(),
                groups_ok = total - failed,
                groups_failed = failed,
                "TLE data refreshed"
            );
            tle_cache = tles;
            tle_fetched_at = Instant::now();
        }

        let mut satellites: Vec<_> = tle_cache
            .iter()
            .filter_map(|tle| propagator::propagate_satellite(tle).ok())
            .collect();

        if satellites.len() > MAX_SATELLITES {
            satellites.truncate(MAX_SATELLITES);
        }

        let total = satellites.len();
        tracing::info!(total, "broadcasting satellites");

        let mut published = false;
        if let Some(producer) = &bus_producer {
            match producer
                .send_json_slices(
                    "satellites.tracker",
                    bus::topics::SATELLITES,
                    &satellites,
                    BUS_CHUNK_SIZE,
                )
                .await
            {
                Ok(_chunk_count) => {
                    published = true;
                }
                Err(e) => {
                    tracing::warn!(
                        error = ?e,
                        topic = bus::topics::SATELLITES,
                        records = satellites.len(),
                        "failed to publish satellites to bus"
                    );
                }
            }
        }

        if let Err(e) = cache::satellites::set_satellites(&redis_pool, &satellites).await {
            tracing::warn!("failed to cache satellites: {e}");
        }

        if !published {
            if let Some(pg_pool) = &pg_pool {
                let observed_at = chrono::Utc::now();
                let rows: Vec<db::models::SatellitePositionRow> = satellites
                    .iter()
                    .map(|s| db::models::SatellitePositionRow {
                        observed_at,
                        norad_id: s.norad_id as i64,
                        name: s.name.clone(),
                        category: s.category.as_str().to_string(),
                        lat: s.lat,
                        lon: s.lon,
                        altitude_km: s.altitude_km,
                        velocity_km_s: s.velocity_km_s,
                    })
                    .collect();
                if let Err(e) = db::satellites::insert_positions(pg_pool, &rows).await {
                    tracing::warn!(error = %e, count = rows.len(), "failed to persist satellites");
                }
            }
        }

        let positions: Vec<SatellitePosition> = satellites
            .into_iter()
            .map(|s| SatellitePosition {
                norad_id: s.norad_id,
                name: s.name,
                category: s.category.as_str().to_string(),
                lat: s.lat,
                lon: s.lon,
                altitude_km: s.altitude_km,
                velocity_km_s: s.velocity_km_s,
            })
            .collect();

        let total_chunks = (positions.len() + WS_CHUNK_SIZE - 1) / WS_CHUNK_SIZE;
        let total_chunks = total_chunks.max(1) as u32;

        for (i, chunk) in positions.chunks(WS_CHUNK_SIZE).enumerate() {
            let msg = WsMessage::SatelliteBatch {
                satellites: chunk.to_vec(),
                chunk_index: i as u32,
                total_chunks,
            };
            let receivers = broadcaster.send(msg);
            tracing::debug!(
                chunk = i,
                total_chunks,
                receivers,
                count = chunk.len(),
                "broadcast satellite chunk"
            );
        }

        tokio::time::sleep(poll_interval).await;
    }
}
