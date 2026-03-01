use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const SEISMIC_KEY: &str = "seismic:earthquakes";
const SEISMIC_TTL_SECS: u64 = 300; // 5min

pub async fn set_seismic<T: serde::Serialize>(
    pool: &RedisPool,
    data: &T,
) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(SEISMIC_KEY, json, SEISMIC_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_seismic<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(SEISMIC_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}
