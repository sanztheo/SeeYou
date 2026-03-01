use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const EVENTS_KEY: &str = "events:active";
const EVENTS_TTL_SECS: u64 = 1800;

pub async fn set_events<T: serde::Serialize>(
    pool: &RedisPool,
    events: &T,
) -> Result<(), CacheError> {
    let json = serde_json::to_string(events)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(EVENTS_KEY, json, EVENTS_TTL_SECS)
        .await?;
    Ok(())
}

pub async fn get_events<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<T>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(EVENTS_KEY).await?;
    match raw {
        Some(json) => Ok(Some(serde_json::from_str(&json)?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_cache_key() {
        assert_eq!(EVENTS_KEY, "events:active");
    }

    #[test]
    fn events_ttl_is_30_minutes() {
        assert_eq!(EVENTS_TTL_SECS, 1800);
    }

    #[test]
    fn events_ttl_within_reasonable_range() {
        assert!(EVENTS_TTL_SECS >= 60, "TTL should be at least 1 minute");
        assert!(EVENTS_TTL_SECS <= 7200, "TTL should be at most 2 hours");
    }
}
