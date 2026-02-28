use deadpool_redis::{Config, Runtime};

pub type RedisPool = deadpool_redis::Pool;

#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("failed to create redis pool: {0}")]
    PoolCreation(#[from] deadpool_redis::CreatePoolError),

    #[error("failed to get redis connection from pool: {0}")]
    Connection(#[from] deadpool_redis::PoolError),

    #[error("redis command failed: {0}")]
    Command(#[from] redis::RedisError),

    #[error("unexpected redis response: expected {expected}, got {actual}")]
    UnexpectedResponse {
        expected: String,
        actual: String,
    },
}

/// Build a connection pool from a Redis URL.
/// The pool manages connections lazily, so this does not
/// verify connectivity -- use `ping_redis` for that.
pub fn create_pool(redis_url: &str) -> Result<RedisPool, CacheError> {
    let config = Config::from_url(redis_url);
    let pool = config.create_pool(Some(Runtime::Tokio1))?;
    Ok(pool)
}
