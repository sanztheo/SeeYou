use std::time::Duration;

use cache::RedisPool;

use crate::health::check_batch_health;
use crate::providers::fetch_all_cameras;

/// Periodically fetch cameras from all providers, health-check them,
/// and cache the result in Redis.
pub async fn run_camera_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
    pg_pool: Option<db::PgPool>,
    bus_producer: Option<bus::BusProducer>,
    poll_interval: Duration,
) {
    tracing::info!(
        interval_secs = poll_interval.as_secs(),
        "camera tracker started"
    );

    loop {
        let (cameras, total_sources, failed_sources) = fetch_all_cameras(&client).await;

        tracing::info!(
            cameras = cameras.len(),
            sources_ok = total_sources - failed_sources,
            sources_failed = failed_sources,
            "fetched cameras from providers"
        );

        let cameras = check_batch_health(&client, cameras).await;

        let online = cameras.iter().filter(|c| c.is_online).count();
        let offline = cameras.len() - online;
        tracing::info!(total = cameras.len(), online, offline, "health check done");

        let mut published = false;
        if let Some(producer) = &bus_producer {
            match bus::BusEnvelope::new_json("1", "cameras.tracker", bus::topics::CAMERAS, &cameras)
            {
                Ok(envelope) => {
                    if producer.send_envelope(&envelope).await.is_ok() {
                        published = true;
                    }
                }
                Err(e) => tracing::warn!(error = %e, "failed to build cameras bus envelope"),
            }
        }

        if let Err(e) = cache::cameras::set_cameras(&redis_pool, &cameras).await {
            tracing::warn!(error = %e, "failed to cache cameras");
        }

        if !published {
            if let Some(pg_pool) = &pg_pool {
                let last_seen = chrono::Utc::now();
                let rows: Vec<db::models::CameraRow> = cameras
                    .iter()
                    .map(|c| db::models::CameraRow {
                        id: c.id.clone(),
                        name: c.name.clone(),
                        lat: c.lat,
                        lon: c.lon,
                        stream_type: format!("{:?}", c.stream_type),
                        source: c.source.clone(),
                        is_online: c.is_online,
                        last_seen,
                        city: Some(c.city.clone()),
                        country: Some(c.country.clone()),
                    })
                    .collect();

                if let Err(e) = db::cameras::upsert_cameras(pg_pool, &rows).await {
                    tracing::warn!(error = %e, count = rows.len(), "failed to persist cameras");
                }
            }
        }

        tokio::time::sleep(poll_interval).await;
    }
}
