use std::{future::Future, sync::Arc};

use anyhow::Context;
use rustls::crypto::{ring, CryptoProvider};
use surrealdb::{
    engine::any::{connect, Any},
    opt::{auth::Root, WaitFor},
    Surreal,
};
use tokio::sync::RwLock;
use tracing::warn;

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
    config: GraphConfig,
    db: Arc<RwLock<Surreal<Any>>>,
}

impl GraphClient {
    pub async fn connect(config: &GraphConfig) -> anyhow::Result<Self> {
        ensure_rustls_crypto_provider();

        let db = connect_db(config).await?;

        Ok(Self {
            config: config.clone(),
            db: Arc::new(RwLock::new(db)),
        })
    }

    pub async fn with_retry<T, Op, Fut>(&self, operation: Op) -> anyhow::Result<T>
    where
        Op: Fn(Surreal<Any>) -> Fut + Clone,
        Fut: Future<Output = anyhow::Result<T>>,
    {
        let db = self.current_db().await;
        match operation.clone()(db).await {
            Ok(value) => Ok(value),
            Err(error) if is_retryable_connection_error(&error) => {
                warn!(error = %error, "graph connection lost; reconnecting and retrying once");
                let db = self.reconnect().await?;
                operation(db).await
            }
            Err(error) => Err(error),
        }
    }

    async fn current_db(&self) -> Surreal<Any> {
        self.db.read().await.clone()
    }

    async fn reconnect(&self) -> anyhow::Result<Surreal<Any>> {
        let db = connect_db(&self.config)
            .await
            .context("failed to reconnect surrealdb after transient graph connection error")?;

        let mut guard = self.db.write().await;
        *guard = db.clone();

        Ok(db)
    }

    pub async fn invalidate(&self) -> anyhow::Result<()> {
        self.current_db()
            .await
            .invalidate()
            .await
            .context("failed to invalidate surrealdb session")
    }
}

fn ensure_rustls_crypto_provider() {
    if CryptoProvider::get_default().is_none() {
        let _ = ring::default_provider().install_default();
    }
}

async fn connect_db(config: &GraphConfig) -> anyhow::Result<Surreal<Any>> {
    let db = connect(&config.url)
        .await
        .with_context(|| format!("failed to connect surrealdb at {}", config.url))?;
    db.wait_for(WaitFor::Connection).await;

    db.signin(Root {
        username: config.username.clone(),
        password: config.password.clone(),
    })
    .await
    .context("failed to authenticate to surrealdb")?;

    db.use_ns(&config.namespace)
        .use_db(&config.database)
        .await
        .context("failed to select surrealdb namespace/database")?;
    db.wait_for(WaitFor::Database).await;

    Ok(db)
}

pub fn is_retryable_connection_error(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        let message = cause.to_string().to_lowercase();
        [
            "connection reset",
            "connection closed",
            "broken pipe",
            "channel closed",
            "unexpected eof",
            "not connected",
            "io error",
            "websocket",
        ]
        .iter()
        .any(|needle| message.contains(needle))
    })
}

pub fn normalize_surreal_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "ws://127.0.0.1:8000".to_string();
    }

    let normalized_scheme = if let Some(rest) = trimmed.strip_prefix("http://") {
        format!("ws://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("https://") {
        format!("wss://{rest}")
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
        without_trailing_slash
    }
}

#[cfg(test)]
mod tests {
    use anyhow::anyhow;

    use super::{is_retryable_connection_error, normalize_surreal_url};

    #[test]
    fn normalizes_http_rpc_url_to_ws() {
        assert_eq!(
            normalize_surreal_url("http://surreal.internal:8000/rpc"),
            "ws://surreal.internal:8000"
        );
    }

    #[test]
    fn normalizes_https_rpc_url_to_wss() {
        assert_eq!(
            normalize_surreal_url("https://surreal.internal/rpc"),
            "wss://surreal.internal"
        );
    }

    #[test]
    fn trims_rpc_suffix_from_ws_url() {
        assert_eq!(
            normalize_surreal_url("ws://127.0.0.1:8000/rpc/"),
            "ws://127.0.0.1:8000"
        );
    }

    #[test]
    fn keeps_ws_url_without_rpc_unchanged() {
        assert_eq!(
            normalize_surreal_url("ws://127.0.0.1:8000"),
            "ws://127.0.0.1:8000"
        );
    }

    #[test]
    fn defaults_empty_url_to_localhost() {
        assert_eq!(normalize_surreal_url(""), "ws://127.0.0.1:8000");
    }

    #[test]
    fn classifies_connection_reset_as_retryable() {
        assert!(is_retryable_connection_error(&anyhow!(
            "connection reset by peer"
        )));
    }

    #[test]
    fn ignores_non_connection_errors() {
        assert!(!is_retryable_connection_error(&anyhow!("parse error")));
    }
}
