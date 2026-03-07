use anyhow::Context;
use tracing::info;

use consumer_graph::GraphBusConsumer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    let _runtime_log_guard =
        runtime_logging::init(env!("CARGO_PKG_NAME"), env!("CARGO_MANIFEST_DIR"))?;

    info!("connecting graph client");
    let graph_config = graph::GraphConfig::from_env();
    let graph_client = graph::GraphClient::connect(&graph_config).await?;
    info!("graph client connected");

    info!("running graph ontology migration");
    graph::ontology::migrate(&graph_client)
        .await
        .context("failed to run graph ontology migration")?;
    info!("graph ontology migration completed");

    let zones_path = std::env::var("GRAPH_ZONES_FILE")
        .unwrap_or_else(|_| "data/zones/global_zones.geojson".to_string());

    info!(path = %zones_path, "seeding graph zones");
    let stats = graph::zones::seed_zones_from_file(&graph_client, &zones_path)
        .await
        .with_context(|| format!("failed to seed zones from {zones_path}"))?;

    info!(count = stats.upserted, "zone seed completed");

    info!("starting graph bus consumer");
    let consumer = GraphBusConsumer::from_env(graph_client)?;
    consumer.run().await
}
