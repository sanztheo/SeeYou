use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const SATELLITES_KEY: &str = "satellites:all";
const SATELLITES_TTL_SECS: u64 = 60;

/// Cache a list of satellites as JSON with a 60-second TTL.
pub async fn set_satellites<T: serde::Serialize>(
    pool: &RedisPool,
    satellites: &[T],
) -> Result<(), CacheError> {
    let json = serde_json::to_string(satellites)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(SATELLITES_KEY, json, SATELLITES_TTL_SECS)
        .await?;
    Ok(())
}

/// Retrieve the cached satellite list, if present and not expired.
pub async fn get_satellites<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<Vec<T>>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(SATELLITES_KEY).await?;

    match raw {
        Some(json) => {
            let satellites = serde_json::from_str(&json)?;
            Ok(Some(satellites))
        }
        None => Ok(None),
    }
}
