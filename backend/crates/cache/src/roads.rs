use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const ROADS_TTL_SECS: u64 = 3600;

fn roads_key(south: f64, west: f64, north: f64, east: f64) -> String {
    format!(
        "roads:{:.2}:{:.2}:{:.2}:{:.2}",
        south, west, north, east
    )
}

pub async fn set_roads<T: serde::Serialize>(
    pool: &RedisPool,
    south: f64,
    west: f64,
    north: f64,
    east: f64,
    roads: &[T],
) -> Result<(), CacheError> {
    let key = roads_key(south, west, north, east);
    let json = serde_json::to_string(roads)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(&key, json, ROADS_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_roads<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
    south: f64,
    west: f64,
    north: f64,
    east: f64,
) -> Result<Option<Vec<T>>, CacheError> {
    let key = roads_key(south, west, north, east);
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(&key).await?;

    match raw {
        Some(json) => {
            let roads = serde_json::from_str(&json)?;
            Ok(Some(roads))
        }
        None => Ok(None),
    }
}
