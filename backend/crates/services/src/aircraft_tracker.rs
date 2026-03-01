use std::collections::HashMap;
use std::time::Duration;

use cache::pool::RedisPool;
use prediction::service::{AircraftMeasurement, PredictionService};
use ws::broadcast::Broadcaster;
use ws::messages::{AircraftPosition, WsMessage};

use crate::adsb;
use crate::aircraft::Aircraft;

/// Safety cap — Cesium struggles above ~30 k entities.
const MAX_AIRCRAFT: usize = 30_000;

/// How many aircraft per WebSocket message chunk.
const WS_CHUNK_SIZE: usize = 2_000;

pub async fn run_aircraft_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
    broadcaster: Broadcaster,
    poll_interval: Duration,
) {
    tracing::info!(
        "aircraft tracker started, polling every {}s (IMM-EKF prediction enabled)",
        poll_interval.as_secs()
    );

    let mut predictor = PredictionService::new();

    loop {
        let mut merged: HashMap<String, Aircraft> = HashMap::new();

        // Fetch civil + military aircraft from regional grid (concurrent)
        let (all_regional, regions_total, regions_failed) =
            adsb::fetch_all_regions(&client).await;

        tracing::info!(
            count = all_regional.len(),
            regions_ok = regions_total - regions_failed,
            regions_failed,
            "fetched aircraft from regional grid"
        );

        for ac in all_regional {
            merged.insert(ac.icao.clone(), ac);
        }

        // Military endpoint as enrichment (always reliable, better mil data)
        match adsb::fetch_military(&client).await {
            Ok(mil) => {
                tracing::debug!(count = mil.len(), "fetched military aircraft");
                for ac in mil {
                    merged.insert(ac.icao.clone(), ac);
                }
            }
            Err(e) => tracing::error!("failed to fetch military aircraft: {e}"),
        }

        // Cap to avoid overwhelming clients
        let mut aircraft: Vec<Aircraft> = merged.into_values().collect();
        if aircraft.len() > MAX_AIRCRAFT {
            aircraft.sort_by(|a, b| b.is_military.cmp(&a.is_military));
            aircraft.truncate(MAX_AIRCRAFT);
        }

        let total = aircraft.len();
        let mil_count = aircraft.iter().filter(|a| a.is_military).count();
        tracing::info!(
            total,
            military = mil_count,
            civilian = total - mil_count,
            "broadcasting aircraft"
        );

        if let Err(e) = cache::aircraft::set_aircraft(&redis_pool, &aircraft).await {
            tracing::warn!("failed to cache aircraft: {e}");
        }

        // ── IMM-EKF prediction for military aircraft ────────────
        let measurements: Vec<AircraftMeasurement> = aircraft
            .iter()
            .filter(|a| a.is_military && !a.on_ground)
            .map(|a| AircraftMeasurement {
                icao: a.icao.clone(),
                lat: a.lat,
                lon: a.lon,
                alt_m: a.altitude_m,
                speed_ms: a.speed_ms,
                heading_deg: a.heading,
                vertical_rate_ms: a.vertical_rate_ms,
                is_military: true,
            })
            .collect();

        let trajectories = predictor.process_batch(&measurements);

        if !trajectories.is_empty() {
            tracing::debug!(
                tracked = predictor.tracked_count(),
                predictions = trajectories.len(),
                "IMM-EKF predictions generated"
            );
            let pred_msg = WsMessage::Predictions { trajectories };
            broadcaster.send(pred_msg);
        }

        // ── Broadcast aircraft positions ────────────────────────
        let positions: Vec<AircraftPosition> = aircraft
            .into_iter()
            .map(|a| AircraftPosition {
                icao: a.icao,
                callsign: a.callsign,
                aircraft_type: a.aircraft_type,
                lat: a.lat,
                lon: a.lon,
                altitude_m: a.altitude_m,
                speed_ms: a.speed_ms,
                heading: a.heading,
                vertical_rate_ms: a.vertical_rate_ms,
                on_ground: a.on_ground,
                is_military: a.is_military,
            })
            .collect();

        let total_chunks = (positions.len() + WS_CHUNK_SIZE - 1) / WS_CHUNK_SIZE;
        let total_chunks = total_chunks.max(1) as u32;

        for (i, chunk) in positions.chunks(WS_CHUNK_SIZE).enumerate() {
            let msg = WsMessage::AircraftBatch {
                aircraft: chunk.to_vec(),
                chunk_index: i as u32,
                total_chunks,
            };
            let receivers = broadcaster.send(msg);
            tracing::debug!(
                chunk = i,
                total_chunks,
                receivers,
                count = chunk.len(),
                "broadcast aircraft chunk"
            );
        }

        tokio::time::sleep(poll_interval).await;
    }
}
