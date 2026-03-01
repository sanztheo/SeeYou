use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const SPACE_WEATHER_KEY: &str = "space_weather:data";
const SPACE_WEATHER_TTL_SECS: u64 = 900; // 15min

pub async fn set_space_weather<T: serde::Serialize>(
    pool: &RedisPool,
    data: &T,
) -> Result<(), CacheError> {
    let json = serde_json::to_string(data)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(SPACE_WEATHER_KEY, json, SPACE_WEATHER_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_space_weather<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(SPACE_WEATHER_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}
