use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const CABLES_KEY: &str = "cables:data";
const CABLES_TTL_SECS: u64 = 86400; // 24h

pub async fn set_cables<T: serde::Serialize>(pool: &RedisPool, data: &T) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(CABLES_KEY, json, CABLES_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_cables<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(CABLES_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}
