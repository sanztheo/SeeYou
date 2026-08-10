use std::collections::HashMap;
use std::time::Duration;

use cache::pool::RedisPool;
use prediction::service::{AircraftMeasurement, SharedPredictor};
use prediction::PredictedTrajectory;
use ws::broadcast::Broadcaster;
use ws::messages::{AircraftPosition, WsMessage};

use crate::adsb::{self, AdsbError};
use crate::aircraft::Aircraft;

/// Safety cap — Cesium struggles above ~30 k entities.
const MAX_AIRCRAFT: usize = 30_000;

/// How many aircraft per WebSocket message chunk.
const WS_CHUNK_SIZE: usize = 2_000;
const BUS_CHUNK_SIZE: usize = 500;

/// Ceiling for the adaptive poll interval's backoff.
const MAX_POLL_INTERVAL: Duration = Duration::from_secs(120);

/// Adapts the poll interval to observed rate-limit pressure: doubles (and
/// honors a provider's `Retry-After` if it asked for longer) whenever a
/// cycle saw any rate-limited region, capped at `MAX_POLL_INTERVAL`;
/// otherwise decays 25% per clean cycle back toward `base`, which is a
/// floor it never drops below. Pure/testable on purpose.
fn next_poll_interval(
    current: Duration,
    base: Duration,
    had_rate_limit: bool,
    retry_after_secs: Option<u64>,
) -> Duration {
    if had_rate_limit {
        let doubled = current.saturating_mul(2).min(MAX_POLL_INTERVAL);
        match retry_after_secs {
            Some(secs) => doubled.max(Duration::from_secs(secs)),
            None => doubled,
        }
    } else {
        current.mul_f64(0.75).max(base)
    }
}

/// Parses `PREDICTIONS_PATTERN_ONLY` — default ON: only an explicit falsy
/// value ("0"/"false"/"no"/"off", case-insensitive) turns it off. Pure by
/// design so it's testable without mutating process env vars, same as
/// `next_poll_interval` above.
fn parse_pattern_only(raw: Option<&str>) -> bool {
    match raw {
        Some(value) => !matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        ),
        None => true,
    }
}

/// Cuts the WS `Predictions` payload to the trajectories worth animating:
/// with the flag on (the default), only aircraft flying a recognised
/// military pattern (Orbit/CAP/Transit/Holding) get broadcast. The rest
/// stay reachable via `GET /aircraft/:icao/predict`
/// (baseline-mesures.md:90-94 — 97% of WS traffic was this message).
fn filter_broadcast_trajectories(
    trajectories: Vec<PredictedTrajectory>,
    pattern_only: bool,
) -> Vec<PredictedTrajectory> {
    if pattern_only {
        trajectories
            .into_iter()
            .filter(|t| t.pattern.is_some())
            .collect()
    } else {
        trajectories
    }
}

pub async fn run_aircraft_tracker(
    client: reqwest::Client,
    redis_pool: RedisPool,
    pg_pool: Option<db::PgPool>,
    bus_producer: Option<bus::BusProducer>,
    broadcaster: Broadcaster,
    poll_interval: Duration,
    predictor: SharedPredictor,
) {
    tracing::info!(
        "aircraft tracker started, polling every {}s (IMM-EKF prediction enabled)",
        poll_interval.as_secs()
    );

    let pattern_only =
        parse_pattern_only(std::env::var("PREDICTIONS_PATTERN_ONLY").ok().as_deref());
    tracing::info!(
        pattern_only,
        "predictions pattern-only filter (PREDICTIONS_PATTERN_ONLY)"
    );

    let base_interval = poll_interval;
    let mut current_interval = poll_interval;

    loop {
        let mut merged: HashMap<String, Aircraft> = HashMap::new();

        // Fetch civil + military aircraft from the regional grid, round-robined
        // across providers and rate-limit-aware (see adsb::fetch_all_regions).
        let adsb::RegionFetchOutcome {
            aircraft: all_regional,
            regions_total,
            regions_failed,
            regions_rate_limited,
            max_retry_after_secs,
        } = adsb::fetch_all_regions(&client).await;

        tracing::info!(
            count = all_regional.len(),
            regions_ok = regions_total - regions_failed,
            regions_failed,
            regions_rate_limited,
            "fetched aircraft from regional grid"
        );

        for ac in all_regional {
            merged.insert(ac.icao.clone(), ac);
        }

        let mut any_rate_limited = regions_rate_limited > 0;
        let mut max_retry_after_secs = max_retry_after_secs;

        // Same provider, same measured budget (adsb::MIN_REQUEST_SPACING):
        // without this gap the mil request lands right after the last
        // staggered grid request to adsb.lol and gets rate limited itself.
        tokio::time::sleep(adsb::MIN_REQUEST_SPACING).await;

        // Military endpoint as enrichment (always reliable, better mil data)
        match adsb::fetch_military(&client).await {
            Ok(mil) => {
                tracing::debug!(count = mil.len(), "fetched military aircraft");
                for ac in mil {
                    merged.insert(ac.icao.clone(), ac);
                }
            }
            Err(AdsbError::RateLimited(retry_after_secs)) => {
                any_rate_limited = true;
                if let Some(secs) = retry_after_secs {
                    max_retry_after_secs = Some(max_retry_after_secs.map_or(secs, |m| m.max(secs)));
                }
                tracing::warn!(?retry_after_secs, "military aircraft fetch rate limited");
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

        let mut published = false;
        if let Some(producer) = &bus_producer {
            match producer
                .send_json_slices(
                    "services.aircraft_tracker",
                    bus::topics::AIRCRAFT,
                    &aircraft,
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
                        topic = bus::topics::AIRCRAFT,
                        records = aircraft.len(),
                        "failed to publish aircraft to bus"
                    );
                }
            }
        }

        if let Err(e) = cache::aircraft::set_aircraft(&redis_pool, &aircraft).await {
            tracing::warn!("failed to cache aircraft: {e}");
        }

        if !published {
            if let Some(pg_pool) = &pg_pool {
                let observed_at = chrono::Utc::now();
                let rows: Vec<db::models::AircraftPositionRow> = aircraft
                    .iter()
                    .map(|a| db::models::AircraftPositionRow {
                        observed_at,
                        icao: a.icao.clone(),
                        callsign: a.callsign.clone(),
                        lat: a.lat,
                        lon: a.lon,
                        altitude_m: a.altitude_m,
                        speed_ms: a.speed_ms,
                        heading_deg: a.heading,
                        vertical_rate_ms: Some(a.vertical_rate_ms),
                        on_ground: a.on_ground,
                        is_military: a.is_military,
                    })
                    .collect();

                if let Err(e) = db::aircraft::insert_positions(pg_pool, &rows).await {
                    tracing::warn!(error = %e, count = rows.len(), "failed to persist aircraft positions");
                }
            }
        }

        // ── IMM-EKF prediction ───────────────────────────────────
        // Every aircraft feeds last-known kinematics (cold-start fallback
        // for the on-demand /predict route); only military/airborne ones
        // get a full IMM tracker — see PredictionService::process_batch.
        let measurements: Vec<AircraftMeasurement> = aircraft
            .iter()
            .map(|a| AircraftMeasurement {
                icao: a.icao.clone(),
                lat: a.lat,
                lon: a.lon,
                alt_m: a.altitude_m,
                speed_ms: a.speed_ms,
                heading_deg: a.heading,
                vertical_rate_ms: a.vertical_rate_ms,
                is_military: a.is_military,
                on_ground: a.on_ground,
            })
            .collect();

        let (trajectories, tracked) = {
            let mut guard = predictor.write().await;
            let trajectories = guard.process_batch(&measurements);
            (trajectories, guard.tracked_count())
        };

        let total_predictions = trajectories.len();
        let broadcast_trajectories = filter_broadcast_trajectories(trajectories, pattern_only);

        if !broadcast_trajectories.is_empty() {
            tracing::debug!(
                tracked,
                total_predictions,
                broadcast_predictions = broadcast_trajectories.len(),
                pattern_only,
                "IMM-EKF predictions generated"
            );
            let pred_msg = WsMessage::Predictions {
                trajectories: broadcast_trajectories,
            };
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

        current_interval =
            next_poll_interval(current_interval, base_interval, any_rate_limited, max_retry_after_secs);
        tracing::debug!(
            next_poll_secs = current_interval.as_secs(),
            any_rate_limited,
            "adaptive poll interval updated"
        );

        tokio::time::sleep(current_interval).await;
    }
}

#[cfg(test)]
mod tests {
    use super::{
        filter_broadcast_trajectories, next_poll_interval, parse_pattern_only, MAX_POLL_INTERVAL,
    };
    use prediction::PredictedTrajectory;
    use std::time::Duration;

    fn dummy_trajectory(icao: &str, pattern: Option<prediction::MilitaryPattern>) -> PredictedTrajectory {
        PredictedTrajectory {
            icao: icao.to_string(),
            points: vec![],
            step_secs: 15.0,
            sigma_growth_m_s: 0.0,
            pattern,
            model_probabilities: [0.25, 0.25, 0.25, 0.25],
            model: "imm".to_string(),
        }
    }

    #[test]
    fn filter_broadcast_trajectories_keeps_all_when_flag_off() {
        let trajectories = vec![dummy_trajectory("a", None), dummy_trajectory("b", None)];
        let kept = filter_broadcast_trajectories(trajectories, false);
        assert_eq!(kept.len(), 2);
    }

    #[test]
    fn filter_broadcast_trajectories_keeps_only_patterned_when_flag_on() {
        let patterned = dummy_trajectory(
            "a",
            Some(prediction::MilitaryPattern::Transit { heading_deg: 90.0 }),
        );
        let unpatterned = dummy_trajectory("b", None);
        let kept = filter_broadcast_trajectories(vec![patterned, unpatterned], true);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].icao, "a");
    }

    #[test]
    fn parse_pattern_only_defaults_to_true() {
        assert!(parse_pattern_only(None));
    }

    #[test]
    fn parse_pattern_only_recognises_falsy_values() {
        for v in ["0", "false", "False", "no", "OFF"] {
            assert!(!parse_pattern_only(Some(v)), "expected {v} to be falsy");
        }
    }

    #[test]
    fn parse_pattern_only_treats_anything_else_as_true() {
        for v in ["1", "true", "yes", "on", "garbage"] {
            assert!(parse_pattern_only(Some(v)), "expected {v} to be truthy");
        }
    }

    #[test]
    fn next_poll_interval_doubles_on_rate_limit() {
        let base = Duration::from_secs(12);
        let next = next_poll_interval(base, base, true, None);
        assert_eq!(next, Duration::from_secs(24));
    }

    #[test]
    fn next_poll_interval_respects_retry_after_floor() {
        let base = Duration::from_secs(12);
        let next = next_poll_interval(base, base, true, Some(40));
        assert_eq!(next, Duration::from_secs(40));
    }

    #[test]
    fn next_poll_interval_caps_at_max() {
        let huge = Duration::from_secs(1000);
        let next = next_poll_interval(huge, Duration::from_secs(12), true, None);
        assert_eq!(next, MAX_POLL_INTERVAL);
    }

    #[test]
    fn next_poll_interval_decays_toward_base_on_success() {
        let base = Duration::from_secs(12);
        let current = Duration::from_secs(48);
        let next = next_poll_interval(current, base, false, None);
        assert_eq!(next, Duration::from_secs(36)); // 48 * 0.75
    }

    #[test]
    fn next_poll_interval_never_drops_below_base() {
        let base = Duration::from_secs(12);
        let current = Duration::from_secs(13);
        let next = next_poll_interval(current, base, false, None);
        assert_eq!(next, base);
    }
}
