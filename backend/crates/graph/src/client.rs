use anyhow::Context;
use surrealdb::{
    engine::any::{connect, Any},
    opt::auth::Root,
    Surreal,
};

#[derive(Debug, Clone)]
pub struct GraphConfig {
    pub url: String,
    pub namespace: String,
    pub database: String,
    pub username: String,
    pub password: String,
}

impl GraphConfig {
    pub fn from_env() -> Self {
        let raw_url =
            std::env::var("SURREALDB_URL").unwrap_or_else(|_| "http://127.0.0.1:8000".to_string());

        Self {
            url: normalize_surreal_url(&raw_url),
            namespace: std::env::var("SURREALDB_NAMESPACE")
                .unwrap_or_else(|_| "seeyou".to_string()),
            database: std::env::var("SURREALDB_DATABASE").unwrap_or_else(|_| "graph".to_string()),
            username: std::env::var("SURREALDB_USERNAME").unwrap_or_else(|_| "root".to_string()),
            password: std::env::var("SURREALDB_PASSWORD").unwrap_or_else(|_| "root".to_string()),
        }
    }
}

#[derive(Clone)]
pub struct GraphClient {
    db: Surreal<Any>,
}

impl GraphClient {
    pub async fn connect(config: &GraphConfig) -> anyhow::Result<Self> {
        let db = connect(&config.url)
            .await
            .with_context(|| format!("failed to connect surrealdb at {}", config.url))?;

        db.signin(Root {
            username: &config.username,
            password: &config.password,
        })
        .await
        .context("failed to authenticate to surrealdb")?;

        db.use_ns(&config.namespace)
            .use_db(&config.database)
            .await
            .context("failed to select surrealdb namespace/database")?;

        Ok(Self { db })
    }

    pub fn db(&self) -> &Surreal<Any> {
        &self.db
    }
}

pub fn normalize_surreal_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "http://127.0.0.1:8000".to_string();
    }

    let normalized_scheme = if let Some(rest) = trimmed.strip_prefix("ws://") {
        format!("http://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("wss://") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    };

    let without_trailing_slash = normalized_scheme.trim_end_matches('/').to_string();

    if without_trailing_slash.ends_with("/rpc") {
        without_trailing_slash
            .trim_end_matches("/rpc")
            .trim_end_matches('/')
            .to_string()
    } else {
        normalized_scheme
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_surreal_url;

    #[test]
    fn normalizes_ws_rpc_url_to_http() {
        assert_eq!(
            normalize_surreal_url("ws://surreal.internal:8000/rpc"),
            "http://surreal.internal:8000"
        );
    }

    #[test]
    fn normalizes_wss_rpc_url_to_https() {
        assert_eq!(
            normalize_surreal_url("wss://surreal.internal/rpc"),
            "https://surreal.internal"
        );
    }

    #[test]
    fn trims_rpc_suffix_from_http_url() {
        assert_eq!(
            normalize_surreal_url("http://127.0.0.1:8000/rpc/"),
            "http://127.0.0.1:8000"
        );
    }

    #[test]
    fn keeps_http_url_without_rpc_unchanged() {
        assert_eq!(
            normalize_surreal_url("http://127.0.0.1:8000"),
            "http://127.0.0.1:8000"
        );
    }

    #[test]
    fn defaults_empty_url_to_localhost() {
        assert_eq!(normalize_surreal_url(""), "http://127.0.0.1:8000");
    }
}
