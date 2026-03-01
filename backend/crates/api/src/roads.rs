use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use tracing::{debug, error, warn};

use cache::RedisPool;
use traffic::{BoundingBox, Road, RoadsResponse};

const MAX_BBOX_AREA: f64 = 25.0;

#[derive(Debug, Deserialize)]
pub struct RoadsQuery {
    pub south: f64,
    pub west: f64,
    pub north: f64,
    pub east: f64,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

fn validate_bbox(q: &RoadsQuery) -> Result<(), StatusCode> {
    if q.south.is_nan() || q.north.is_nan() || q.west.is_nan() || q.east.is_nan() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if q.south > q.north || q.south < -90.0 || q.north > 90.0 || q.west < -180.0 || q.east > 180.0
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let area = (q.north - q.south) * (q.east - q.west);
    if area > MAX_BBOX_AREA {
        warn!(area, "bbox too large, rejecting request");
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

fn paginate(roads: Vec<Road>, offset: Option<usize>, limit: Option<usize>) -> (Vec<Road>, usize) {
    let total = roads.len();
    let off = offset.unwrap_or(0).min(total);
    let lim = limit.unwrap_or(total);
    let page: Vec<Road> = roads.into_iter().skip(off).take(lim).collect();
    (page, total)
}

pub async fn get_roads(
    State(pool): State<RedisPool>,
    Query(q): Query<RoadsQuery>,
) -> Result<Json<RoadsResponse>, StatusCode> {
    validate_bbox(&q)?;

    let bbox = BoundingBox {
        south: q.south,
        west: q.west,
        north: q.north,
        east: q.east,
    };

    if let Ok(Some(cached)) =
        cache::roads::get_roads::<Road>(&pool, bbox.south, bbox.west, bbox.north, bbox.east).await
    {
        debug!(count = cached.len(), "serving roads from cache");
        let (page, total) = paginate(cached, q.offset, q.limit);
        return Ok(Json(RoadsResponse {
            roads: page,
            total,
            bbox,
        }));
    }

    let client = reqwest::Client::builder()
        .user_agent("SeeYou/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match traffic::fetch_roads(&client, &bbox).await {
        Ok(roads) => {
            if let Err(e) =
                cache::roads::set_roads(&pool, bbox.south, bbox.west, bbox.north, bbox.east, &roads)
                    .await
            {
                error!(error = %e, "failed to cache roads");
            }
            debug!(count = roads.len(), "fetched roads from Overpass");
            let (page, total) = paginate(roads, q.offset, q.limit);
            Ok(Json(RoadsResponse { roads: page, total, bbox }))
        }
        Err(e) => {
            error!(error = %e, "Overpass request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(south: f64, west: f64, north: f64, east: f64) -> RoadsQuery {
        RoadsQuery { south, west, north, east, offset: None, limit: None }
    }

    #[test]
    fn valid_bbox_passes() {
        assert!(validate_bbox(&query(48.0, 2.0, 49.0, 3.0)).is_ok());
    }

    #[test]
    fn nan_south_rejected() {
        assert!(validate_bbox(&query(f64::NAN, 2.0, 49.0, 3.0)).is_err());
    }

    #[test]
    fn nan_east_rejected() {
        assert!(validate_bbox(&query(48.0, 2.0, 49.0, f64::NAN)).is_err());
    }

    #[test]
    fn south_greater_than_north_rejected() {
        assert!(validate_bbox(&query(50.0, 2.0, 49.0, 3.0)).is_err());
    }

    #[test]
    fn out_of_range_lat_rejected() {
        assert!(validate_bbox(&query(-91.0, 2.0, 49.0, 3.0)).is_err());
        assert!(validate_bbox(&query(48.0, 2.0, 91.0, 3.0)).is_err());
    }

    #[test]
    fn out_of_range_lon_rejected() {
        assert!(validate_bbox(&query(48.0, -181.0, 49.0, 3.0)).is_err());
        assert!(validate_bbox(&query(48.0, 2.0, 49.0, 181.0)).is_err());
    }

    #[test]
    fn area_too_large_rejected() {
        assert!(validate_bbox(&query(-80.0, -170.0, 80.0, 170.0)).is_err());
    }

    #[test]
    fn area_at_limit_passes() {
        assert!(validate_bbox(&query(0.0, 0.0, 5.0, 5.0)).is_ok());
    }

    #[test]
    fn area_just_over_limit_rejected() {
        assert!(validate_bbox(&query(0.0, 0.0, 5.1, 5.0)).is_err());
    }

    #[test]
    fn infinity_rejected() {
        assert!(validate_bbox(&query(f64::INFINITY, 0.0, 1.0, 1.0)).is_err());
        assert!(validate_bbox(&query(0.0, f64::NEG_INFINITY, 1.0, 1.0)).is_err());
    }

    fn make_roads(n: usize) -> Vec<Road> {
        (0..n)
            .map(|i| Road {
                id: i as u64,
                road_type: traffic::RoadType::Primary,
                name: None,
                nodes: vec![],
                speed_limit_kmh: None,
            })
            .collect()
    }

    #[test]
    fn paginate_no_params_returns_all() {
        let roads = make_roads(10);
        let (page, total) = paginate(roads, None, None);
        assert_eq!(total, 10);
        assert_eq!(page.len(), 10);
    }

    #[test]
    fn paginate_with_offset_and_limit() {
        let roads = make_roads(10);
        let (page, total) = paginate(roads, Some(2), Some(3));
        assert_eq!(total, 10);
        assert_eq!(page.len(), 3);
        assert_eq!(page[0].id, 2);
    }

    #[test]
    fn paginate_offset_beyond_length_returns_empty() {
        let roads = make_roads(5);
        let (page, total) = paginate(roads, Some(100), Some(3));
        assert_eq!(total, 5);
        assert_eq!(page.len(), 0);
    }

    #[test]
    fn paginate_limit_larger_than_remaining() {
        let roads = make_roads(5);
        let (page, total) = paginate(roads, Some(3), Some(100));
        assert_eq!(total, 5);
        assert_eq!(page.len(), 2);
    }
}
