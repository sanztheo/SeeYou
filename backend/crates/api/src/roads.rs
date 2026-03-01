use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use tracing::{debug, error};

use cache::RedisPool;
use traffic::{BoundingBox, Road, RoadsResponse};

#[derive(Debug, Deserialize)]
pub struct RoadsQuery {
    pub south: f64,
    pub west: f64,
    pub north: f64,
    pub east: f64,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
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

    let client = reqwest::Client::new();
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
