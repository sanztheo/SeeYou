use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const CYBER_KEY: &str = "cyber:threats";
const CYBER_TTL_SECS: u64 = 900; // 15min

pub async fn set_cyber<T: serde::Serialize>(pool: &RedisPool, data: &T) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(CYBER_KEY, json, CYBER_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_cyber<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(CYBER_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}
