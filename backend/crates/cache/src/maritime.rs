use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const MARITIME_KEY: &str = "maritime:vessels";
const MARITIME_TTL_SECS: u64 = 600; // 10min

pub async fn set_maritime<T: serde::Serialize>(
    pool: &RedisPool,
    data: &T,
) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(MARITIME_KEY, json, MARITIME_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_maritime<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(MARITIME_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}
