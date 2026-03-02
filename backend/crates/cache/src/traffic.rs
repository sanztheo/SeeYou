use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

pub async fn set_cached<T: serde::Serialize>(
    pool: &RedisPool,
    key: &str,
    data: &T,
    ttl_secs: u64,
) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(key, json, ttl_secs).await?;
    Ok(())
}

pub async fn get_cached<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
    key: &str,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(key).await?;

    match raw {
        Some(json) => {
            let data = serde_json::from_str(&json)?;
            Ok(Some(data))
        }
        None => Ok(None),
    }
}
