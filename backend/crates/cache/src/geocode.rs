use deadpool_redis::redis::AsyncCommands;

use crate::pool::{CacheError, RedisPool};

const GEOCODE_TTL_SECS: u64 = 86400;

fn geocode_key(query: &str) -> String {
    let normalized = query.to_lowercase();
    let normalized = normalized.trim();
    let sanitized: String = normalized
        .chars()
        .map(|c| if c == ':' || c.is_control() { '_' } else { c })
        .collect();
    format!("geocode:{sanitized}")
}

pub async fn get_geocode(pool: &RedisPool, query: &str) -> Result<Option<String>, CacheError> {
    let key = geocode_key(query);
    let mut conn = pool.get().await?;
    let raw: Option<String> = conn.get(&key).await?;
    Ok(raw)
}

pub async fn set_geocode(pool: &RedisPool, query: &str, json: &str) -> Result<(), CacheError> {
    let key = geocode_key(query);
    let mut conn = pool.get().await?;
    conn.set_ex::<_, _, ()>(&key, json, GEOCODE_TTL_SECS).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_lowercased() {
        assert_eq!(geocode_key("Paris"), geocode_key("paris"));
        assert_eq!(geocode_key("TOKYO"), geocode_key("tokyo"));
    }

    #[test]
    fn key_is_trimmed() {
        assert_eq!(geocode_key("  paris  "), geocode_key("paris"));
    }

    #[test]
    fn colons_are_sanitized() {
        let key = geocode_key("paris:injection");
        assert!(!key.contains("paris:injection"));
        assert!(key.starts_with("geocode:"));
        assert!(key.contains("paris_injection"));
    }

    #[test]
    fn control_chars_are_sanitized() {
        let key = geocode_key("paris\0evil\nnewline");
        assert!(!key.contains('\0'));
        assert!(!key.contains('\n'));
        assert!(key.contains("paris_evil_newline"));
    }

    #[test]
    fn normal_query_produces_expected_key() {
        assert_eq!(geocode_key("paris"), "geocode:paris");
        assert_eq!(geocode_key("New York"), "geocode:new york");
    }

    #[test]
    fn empty_query_produces_valid_key() {
        let key = geocode_key("");
        assert_eq!(key, "geocode:");
    }

    #[test]
    fn unicode_preserved() {
        let key = geocode_key("Zurich");
        assert!(key.contains("zurich"));
    }

    #[test]
    fn multiple_colons_all_sanitized() {
        let key = geocode_key("a:b:c:d");
        assert_eq!(key, "geocode:a_b_c_d");
    }
}
