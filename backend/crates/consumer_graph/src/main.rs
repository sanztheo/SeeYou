use anyhow::Context;
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

use consumer_graph::GraphBusConsumer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let graph_config = graph::GraphConfig::from_env();
    let graph_client = graph::GraphClient::connect(&graph_config).await?;

    graph::ontology::migrate(&graph_client)
        .await
        .context("failed to run graph ontology migration")?;

    let zones_path = std::env::var("GRAPH_ZONES_FILE")
        .unwrap_or_else(|_| "data/zones/global_zones.geojson".to_string());

    let stats = graph::zones::seed_zones_from_file(&graph_client, &zones_path)
        .await
        .with_context(|| format!("failed to seed zones from {zones_path}"))?;

    info!(count = stats.upserted, "zone seed completed");

    let consumer = GraphBusConsumer::from_env(graph_client)?;
    consumer.run().await
}
