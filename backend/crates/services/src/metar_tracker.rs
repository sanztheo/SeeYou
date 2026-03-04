use std::time::Duration;

use cache::pool::RedisPool;
use ws::broadcast::Broadcaster;
use ws::messages::WsMessage;

pub async fn run_metar_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
    pg_pool: Option<db::PgPool>,
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

                if let Some(pg_pool) = &pg_pool {
                    let observed_at = chrono::Utc::now();
                    let rows: Vec<db::models::WeatherReadingRow> = stations
                        .iter()
                        .map(|s| db::models::WeatherReadingRow {
                            observed_at,
                            station_id: s.station_id.clone(),
                            city: None,
                            lat: s.lat,
                            lon: s.lon,
                            temp_c: s.temp_c,
                            wind_kt: s.wind_speed_kt.map(f64::from),
                            visibility_m: s.visibility_m,
                            conditions: Some(s.flight_category.clone()),
                        })
                        .collect();

                    if let Err(e) = db::weather::insert_readings(pg_pool, &rows).await {
                        tracing::warn!(error = %e, count = rows.len(), "failed to persist metar weather readings");
                    }
                }

                let receivers = broadcaster.send(WsMessage::MetarUpdate { stations });
                tracing::debug!(receivers, "broadcast METAR update");
            }
            Err(e) => tracing::warn!(error = %e, "METAR fetch failed"),
        }

        tokio::time::sleep(poll_interval).await;
    }
}
