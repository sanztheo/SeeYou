use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const METAR_KEY: &str = "metar:all";
const METAR_TTL_SECS: u64 = 300;

pub async fn set_metar<T: serde::Serialize>(
    pool: &RedisPool,
    stations: &[T],
) -> Result<(), CacheError> {
    let json = serde_json::to_string(stations)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(METAR_KEY, json, METAR_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_metar<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<Vec<T>>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(METAR_KEY).await?;

    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metar_cache_key() {
        assert_eq!(METAR_KEY, "metar:all");
    }

    #[test]
    fn metar_ttl_is_5_minutes() {
        assert_eq!(METAR_TTL_SECS, 300);
    }

    #[test]
    fn metar_ttl_within_reasonable_range() {
        assert!(METAR_TTL_SECS >= 60, "TTL should be at least 1 minute");
        assert!(METAR_TTL_SECS <= 3600, "TTL should be at most 1 hour");
    }
}
