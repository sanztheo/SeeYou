use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const AIRCRAFT_KEY: &str = "aircraft:all";
const AIRCRAFT_TTL_SECS: u64 = 15;

/// Cache a list of aircraft as JSON with a 15-second TTL.
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
