use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const FIRES_KEY: &str = "fires:hotspots";
const FIRES_TTL_SECS: u64 = 1800; // 30min

pub async fn set_fires<T: serde::Serialize>(pool: &RedisPool, data: &T) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(FIRES_KEY, json, FIRES_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_fires<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(FIRES_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}
