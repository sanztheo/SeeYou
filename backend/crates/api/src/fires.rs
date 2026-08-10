use std::sync::LazyLock;
use std::time::{Duration, Instant};

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use cache::RedisPool;
use fires::{FireHotspot, FiresResponse};
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::RwLock;

/// Mirrors the fires refresh cadence (`FIRES_POLL_INTERVAL_SECS` /
/// `cache::fires::FIRES_TTL_SECS`, both 1800s): the decoded cache never
/// serves data older than the Redis blob it was decoded from.
const DECODED_CACHE_TTL: Duration = Duration::from_secs(1800);

/// Process-memory cache of the decoded fires blob (~18 MB / 89k items).
/// Without it, every request re-decodes the full Redis JSON blob even
/// though only a bbox-filtered subset is ever returned.
static DECODED_FIRES: LazyLock<RwLock<Option<(Instant, FiresResponse)>>> =
    LazyLock::new(|| RwLock::new(None));

#[derive(Debug, Deserialize)]
pub struct BboxQuery {
    south: Option<f64>,
    west: Option<f64>,
    north: Option<f64>,
    east: Option<f64>,
    limit: Option<usize>,
}

fn filter_fires(fires: &[FireHotspot], q: &BboxQuery) -> Vec<FireHotspot> {
    let matched: Vec<FireHotspot> = match (q.south, q.west, q.north, q.east) {
        (Some(s), Some(w), Some(n), Some(e)) => fires
            .iter()
            .filter(|f| f.lat >= s && f.lat <= n && f.lon >= w && f.lon <= e)
            .cloned()
            .collect(),
        _ => fires.to_vec(),
    };

    match q.limit {
        Some(limit) => matched.into_iter().take(limit).collect(),
        None => matched,
    }
}

/// Returns the bbox-filtered fires plus the source `fetched_at`, decoding
/// the Redis blob at most once per `DECODED_CACHE_TTL` window.
async fn filtered_fires(
    pool: &RedisPool,
    q: &BboxQuery,
) -> Result<(Vec<FireHotspot>, String), StatusCode> {
    {
        let cached = DECODED_FIRES.read().await;
        if let Some((decoded_at, data)) = cached.as_ref() {
            if decoded_at.elapsed() < DECODED_CACHE_TTL {
                return Ok((filter_fires(&data.fires, q), data.fetched_at.clone()));
            }
        }
    }

    let data = match cache::fires::get_fires::<FiresResponse>(pool).await {
        Ok(Some(data)) => data,
        Ok(None) => return Err(StatusCode::SERVICE_UNAVAILABLE),
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    let filtered = filter_fires(&data.fires, q);
    let fetched_at = data.fetched_at.clone();
    *DECODED_FIRES.write().await = Some((Instant::now(), data));
    Ok((filtered, fetched_at))
}

pub async fn get_fires(
    State(pool): State<RedisPool>,
    Query(q): Query<BboxQuery>,
) -> Result<Json<Value>, StatusCode> {
    let (fires, fetched_at) = filtered_fires(&pool, &q).await?;

    let mut fires_json =
        serde_json::to_value(&fires).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(arr) = fires_json.as_array_mut() {
        super::stable_ids::inject_stable_ids_in_array("fire_hotspot", arr);
    }

    Ok(Json(serde_json::json!({
        "fires": fires_json,
        "fetched_at": fetched_at,
    })))
}

#[cfg(test)]
mod tests {
    use super::{filter_fires, BboxQuery};
    use fires::FireHotspot;

    fn hotspot(lat: f64, lon: f64) -> FireHotspot {
        FireHotspot {
            lat,
            lon,
            brightness: 300.0,
            confidence: "high".into(),
            frp: 10.0,
            daynight: "D".into(),
            acq_date: "2026-08-10".into(),
            acq_time: "1200".into(),
            satellite: "N".into(),
        }
    }

    fn query(
        south: Option<f64>,
        west: Option<f64>,
        north: Option<f64>,
        east: Option<f64>,
        limit: Option<usize>,
    ) -> BboxQuery {
        BboxQuery {
            south,
            west,
            north,
            east,
            limit,
        }
    }

    #[test]
    fn no_bbox_returns_everything() {
        let fires = vec![hotspot(48.0, 2.0), hotspot(-10.0, 100.0)];
        let q = query(None, None, None, None, None);
        assert_eq!(filter_fires(&fires, &q).len(), 2);
    }

    #[test]
    fn bbox_keeps_only_points_inside() {
        let fires = vec![hotspot(48.0, 2.0), hotspot(-10.0, 100.0)];
        let q = query(Some(40.0), Some(-5.0), Some(52.0), Some(10.0), None);
        let result = filter_fires(&fires, &q);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].lat, 48.0);
    }

    #[test]
    fn partial_bbox_is_ignored_like_cameras_pattern() {
        let fires = vec![hotspot(48.0, 2.0), hotspot(-10.0, 100.0)];
        let q = query(Some(40.0), None, Some(52.0), None, None);
        assert_eq!(filter_fires(&fires, &q).len(), 2);
    }

    #[test]
    fn limit_truncates_after_bbox_filter() {
        let fires = vec![hotspot(48.0, 2.0), hotspot(49.0, 3.0), hotspot(50.0, 4.0)];
        let q = query(Some(40.0), Some(-5.0), Some(52.0), Some(10.0), Some(2));
        assert_eq!(filter_fires(&fires, &q).len(), 2);
    }
}
