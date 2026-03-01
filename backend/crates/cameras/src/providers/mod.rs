mod caltrans;
mod generic;
mod mcp_camera;
mod nycdot;
mod otcmap;
mod tfl;

use anyhow::Result;
use async_trait::async_trait;

use crate::types::Camera;

#[async_trait]
pub trait CameraProvider: Send + Sync {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>>;
    fn source_name(&self) -> &'static str;
}

fn all_providers() -> Vec<Box<dyn CameraProvider>> {
    vec![
        Box::new(tfl::TflProvider),
        Box::new(nycdot::NycdotProvider),
        Box::new(caltrans::CaltransProvider),
        Box::new(otcmap::OtcMapProvider),
        Box::new(mcp_camera::McpCameraProvider),
        Box::new(generic::GenericProvider),
    ]
}

/// Fetch cameras from every provider concurrently.
/// Returns `(cameras, total_sources, failed_sources)`.
pub async fn fetch_all_cameras(client: &reqwest::Client) -> (Vec<Camera>, usize, usize) {
    let providers = all_providers();
    let total = providers.len();

    let handles: Vec<_> = providers
        .into_iter()
        .map(|p| {
            let c = client.clone();
            tokio::spawn(async move {
                let name = p.source_name();
                match p.fetch_cameras(&c).await {
                    Ok(cams) => {
                        tracing::info!(source = name, count = cams.len(), "fetched cameras");
                        Ok(cams)
                    }
                    Err(e) => {
                        tracing::error!(source = name, error = %e, "camera provider failed");
                        Err(e)
                    }
                }
            })
        })
        .collect();

    let mut cameras = Vec::new();
    let mut failed = 0usize;

    for handle in handles {
        match handle.await {
            Ok(Ok(cams)) => cameras.extend(cams),
            _ => failed += 1,
        }
    }

    (cameras, total, failed)
}
