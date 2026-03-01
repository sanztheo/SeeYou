use std::time::Duration;

use cache::RedisPool;

use crate::health::check_batch_health;
use crate::providers::fetch_all_cameras;

/// Periodically fetch cameras from all providers, health-check them,
/// and cache the result in Redis.
pub async fn run_camera_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
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

        if let Err(e) = cache::cameras::set_cameras(&redis_pool, &cameras).await {
            tracing::warn!(error = %e, "failed to cache cameras");
        }

        tokio::time::sleep(poll_interval).await;
    }
}
