use redis::cmd;

use crate::pool::{CacheError, RedisPool};

/// Verify Redis is reachable by issuing a PING command.
/// Returns `Ok(())` when the server replies "PONG".
pub async fn ping_redis(pool: &RedisPool) -> Result<(), CacheError> {
    let mut conn = pool.get().await?;
    let response: String = cmd("PING").query_async(&mut conn).await?;

    if response != "PONG" {
        return Err(CacheError::UnexpectedResponse {
            expected: "PONG".into(),
            actual: response,
        });
    }

    Ok(())
}
