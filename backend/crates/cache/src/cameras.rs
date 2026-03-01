use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const CAMERAS_KEY: &str = "cameras:all";
const CAMERAS_TTL_SECS: u64 = 300;

/// Cache a list of cameras as JSON with a 5-minute TTL.
pub async fn set_cameras<T: serde::Serialize>(
    pool: &RedisPool,
    cameras: &[T],
) -> Result<(), CacheError> {
    let json = serde_json::to_string(cameras)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(CAMERAS_KEY, json, CAMERAS_TTL_SECS)
        .await?;
    Ok(())
}

/// Retrieve the cached camera list, if present and not expired.
pub async fn get_cameras<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<Vec<T>>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(CAMERAS_KEY).await?;

    match raw {
        Some(json) => {
            let cameras = serde_json::from_str(&json)?;
            Ok(Some(cameras))
        }
        None => Ok(None),
    }
}
