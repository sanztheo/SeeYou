use std::time::Duration;

use cache::pool::RedisPool;
use ws::broadcast::Broadcaster;
use ws::messages::WsMessage;

pub async fn run_metar_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
    broadcaster: Broadcaster,
    poll_interval: Duration,
) {
    tracing::info!(
        "METAR tracker started, polling every {}s",
        poll_interval.as_secs()
    );

    loop {
        match crate::aviation_weather::fetch_metar_stations(&client).await {
            Ok(stations) => {
                let count = stations.len();
                tracing::info!(count, "METAR stations updated");

                if let Err(e) = cache::metar::set_metar(&redis_pool, &stations).await {
                    tracing::warn!(error = %e, "failed to cache METAR");
                }

                let receivers =
                    broadcaster.send(WsMessage::MetarUpdate { stations });
                tracing::debug!(receivers, "broadcast METAR update");
            }
            Err(e) => tracing::warn!(error = %e, "METAR fetch failed"),
        }

        tokio::time::sleep(poll_interval).await;
    }
}
