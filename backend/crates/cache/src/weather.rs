use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const WEATHER_KEY: &str = "weather:grid";
const WEATHER_TTL_SECS: u64 = 600;

pub async fn set_weather<T: serde::Serialize>(
    pool: &RedisPool,
    grid: &T,
) -> Result<(), CacheError> {
    let json = serde_json::to_string(grid)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(WEATHER_KEY, json, WEATHER_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_weather<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(WEATHER_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weather_cache_key() {
        assert_eq!(WEATHER_KEY, "weather:grid");
    }

    #[test]
    fn weather_ttl_is_10_minutes() {
        assert_eq!(WEATHER_TTL_SECS, 600);
    }

    #[test]
    fn weather_ttl_within_reasonable_range() {
        assert!(WEATHER_TTL_SECS >= 60, "TTL should be at least 1 minute");
        assert!(WEATHER_TTL_SECS <= 3600, "TTL should be at most 1 hour");
    }
}
