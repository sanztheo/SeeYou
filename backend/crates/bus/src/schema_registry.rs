use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::warn;
use url::Url;

#[derive(Clone)]
pub struct SchemaRegistryClient {
    base_url: Option<Url>,
    client: reqwest::Client,
}

#[derive(Debug, Deserialize)]
pub struct SchemaRegistrySchema {
    pub id: i32,
    pub schema: String,
    pub subject: Option<String>,
    pub version: Option<i32>,
}

#[derive(Debug, Serialize)]
struct RegisterSchemaPayload<'a> {
    schema: &'a str,
}

#[derive(Debug, Deserialize)]
struct RegisterSchemaResponse {
    id: i32,
}

impl SchemaRegistryClient {
    pub fn new(raw_url: Option<&str>) -> Self {
        let base_url = raw_url
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .and_then(|value| Url::parse(value).ok());

        Self {
            base_url,
            client: reqwest::Client::new(),
        }
    }

    pub async fn get_latest_schema(&self, subject: &str) -> Option<SchemaRegistrySchema> {
        let Some(base_url) = &self.base_url else {
            return None;
        };

        let mut endpoint = base_url.clone();
        endpoint.set_path(&format!("subjects/{subject}/versions/latest"));

        match self.client.get(endpoint).send().await {
            Ok(response) if response.status().is_success() => {
                response.json::<SchemaRegistrySchema>().await.ok()
            }
            Ok(response) => {
                warn!(status = %response.status(), subject, "schema registry returned non-success status");
                None
            }
            Err(error) => {
                warn!(%error, subject, "schema registry request failed");
                None
            }
        }
    }

    pub async fn register_schema(&self, subject: &str, schema: &str) -> Option<i32> {
        let Some(base_url) = &self.base_url else {
            return None;
        };

        let mut endpoint = base_url.clone();
        endpoint.set_path(&format!("subjects/{subject}/versions"));

        let payload = RegisterSchemaPayload { schema };

        match self.client.post(endpoint).json(&payload).send().await {
            Ok(response) if response.status().is_success() => response
                .json::<RegisterSchemaResponse>()
                .await
                .ok()
                .map(|data| data.id),
            Ok(response) => {
                warn!(status = %response.status(), subject, "schema registry registration failed");
                None
            }
            Err(error) => {
                warn!(%error, subject, "schema registry registration request failed");
                None
            }
        }
    }

    pub fn is_configured(&self) -> bool {
        self.base_url.is_some()
    }

    pub async fn ensure_schema(&self, subject: &str, schema: &str) -> Result<Option<i32>> {
        if let Some(existing) = self.get_latest_schema(subject).await {
            return Ok(Some(existing.id));
        }

        Ok(self.register_schema(subject, schema).await)
    }
}
