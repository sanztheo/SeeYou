use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const AIRCRAFT_KEY: &str = "aircraft:all";
/// Must stay above a full tracker cycle (poll interval + worst-case fetch), or the key
/// expires between writes and readers see an empty cache. The rate-limited regional fetch
/// makes that cycle several times longer than the 12s poll interval alone.
const AIRCRAFT_TTL_SECS: u64 = 60;

/// Cache a list of aircraft as JSON.
pub async fn set_aircraft<T: serde::Serialize>(
    pool: &RedisPool,
    aircraft: &[T],
) -> Result<(), CacheError> {
    let json = serde_json::to_string(aircraft)?;
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(AIRCRAFT_KEY, json, AIRCRAFT_TTL_SECS)
        .await?;
    Ok(())
}

/// Retrieve the cached aircraft list, if present and not expired.
pub async fn get_aircraft<T: serde::de::DeserializeOwned>(
    pool: &RedisPool,
) -> Result<Option<Vec<T>>, CacheError> {
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(AIRCRAFT_KEY).await?;

    match raw {
        Some(json) => {
            let aircraft = serde_json::from_str(&json)?;
            Ok(Some(aircraft))
        }
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aircraft_cache_key() {
        assert_eq!(AIRCRAFT_KEY, "aircraft:all");
    }

    #[test]
    fn aircraft_ttl_is_1_minute() {
        assert_eq!(AIRCRAFT_TTL_SECS, 60);
    }

    #[test]
    fn aircraft_ttl_outlives_a_tracker_cycle() {
        // The tracker sleeps DEFAULT_POLL_INTERVAL_SECS (12s) then runs a rate-limited
        // regional fetch. A TTL below the resulting cycle empties the key between writes.
        assert!(
            AIRCRAFT_TTL_SECS >= 36,
            "TTL must cover a full poll interval plus fetch, or readers see an empty cache"
        );
        assert!(AIRCRAFT_TTL_SECS <= 300, "TTL should be at most 5 minutes");
    }
}
