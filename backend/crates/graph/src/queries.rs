use serde_json::Value;
use surrealdb::types::Value as SurrealValue;

use crate::GraphClient;

pub async fn get_entity(
    client: &GraphClient,
    table: &str,
    id: &str,
) -> anyhow::Result<Option<Value>> {
    let table = table.to_string();
    let id = id.to_string();

    let mut response = client
        .with_retry(move |db| {
            let table = table.clone();
            let id = id.clone();
            async move {
                let response = db
                    .query("SELECT * FROM type::record($table, $id);")
                    .bind(("table", table))
                    .bind(("id", id))
                    .await?
                    .check()?;
                Ok(response)
            }
        })
        .await?;

    let record: Option<SurrealValue> = response.take(0)?;
    Ok(record.map(SurrealValue::into_json_value))
}

pub async fn get_neighbors(
    client: &GraphClient,
    table: &str,
    id: &str,
    depth: usize,
) -> anyhow::Result<Vec<Value>> {
    let table = table.to_string();
    let id = id.to_string();

    let mut response = client
        .with_retry(move |db| {
            let table = table.clone();
            let id = id.clone();
            async move {
                let response = db
                    .query(
                        "SELECT ->* AS outgoing, <-* AS incoming FROM type::record($table, $id) FETCH ->*, <-* LIMIT $depth;",
                    )
                    .bind(("table", table))
                    .bind(("id", id))
                    .bind(("depth", depth.max(1) as i64))
                    .await?
                    .check()?;
                Ok(response)
            }
        })
        .await?;

    let records: Vec<SurrealValue> = response.take(0)?;
    Ok(records
        .into_iter()
        .map(SurrealValue::into_json_value)
        .collect())
}

pub async fn get_incident_relations(
    client: &GraphClient,
    relation_table: &str,
    table: &str,
    id: &str,
    limit: usize,
) -> anyhow::Result<Vec<Value>> {
    let relation_table = relation_table.to_string();
    let table = table.to_string();
    let id = id.to_string();

    let mut response = client
        .with_retry(move |db| {
            let relation_table = relation_table.clone();
            let table = table.clone();
            let id = id.clone();
            async move {
                let response = db
                    .query(
                        r#"
                        SELECT *,
                            record::tb(`in`) AS in_table,
                            <string>record::id(`in`) AS in_id,
                            record::tb(`out`) AS out_table,
                            <string>record::id(`out`) AS out_id
                        FROM type::table($relation_table)
                        WHERE `in` = type::record($table, $id) OR `out` = type::record($table, $id)
                        LIMIT $limit;
                        "#,
                    )
                    .bind(("relation_table", relation_table))
                    .bind(("table", table))
                    .bind(("id", id))
                    .bind(("limit", limit.max(1) as i64))
                    .await?
                    .check()?;
                Ok(response)
            }
        })
        .await?;

    let records: Vec<SurrealValue> = response.take(0)?;
    Ok(records
        .into_iter()
        .map(SurrealValue::into_json_value)
        .collect())
}

pub async fn get_table_records(
    client: &GraphClient,
    table: &str,
    limit: usize,
) -> anyhow::Result<Vec<Value>> {
    let table = table.to_string();
    let mut response = client
        .with_retry(move |db| {
            let table = table.clone();
            async move {
                let response = db
                    .query("SELECT * FROM type::table($table) LIMIT $limit;")
                    .bind(("table", table))
                    .bind(("limit", limit.max(1) as i64))
                    .await?
                    .check()?;
                Ok(response)
            }
        })
        .await?;

    let records: Vec<SurrealValue> = response.take(0)?;
    Ok(records
        .into_iter()
        .map(SurrealValue::into_json_value)
        .collect())
}

/// Filters on the same field set `api::graph_api`'s search endpoint labels
/// entities from (id, name, title, callsign, city, description, country,
/// event_type, type, site_type) — pushed into SurrealDB instead of pulling
/// a fixed-size page of raw rows into the app and filtering there, which
/// silently truncated the search to whatever happened to be first in
/// storage order on tables bigger than that page (camera has 11k+ rows,
/// fire_hotspot has 150k+). `?? ''` coalesces fields a given table doesn't
/// have (`string::lowercase` errors on NONE rather than treating it as "no
/// match").
pub async fn search_table_records(
    client: &GraphClient,
    table: &str,
    needle_lowercase: &str,
    limit: usize,
) -> anyhow::Result<Vec<Value>> {
    let table = table.to_string();
    let needle = needle_lowercase.to_string();
    let mut response = client
        .with_retry(move |db| {
            let table = table.clone();
            let needle = needle.clone();
            async move {
                let response = db
                    .query(
                        r#"
                        SELECT * FROM type::table($table)
                        WHERE string::lowercase(<string>record::id(id)) CONTAINS $needle
                           OR string::lowercase(<string>(name ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(title ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(callsign ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(city ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(description ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(country ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(event_type ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(`type` ?? '')) CONTAINS $needle
                           OR string::lowercase(<string>(site_type ?? '')) CONTAINS $needle
                        LIMIT $limit;
                        "#,
                    )
                    .bind(("table", table))
                    .bind(("needle", needle))
                    .bind(("limit", limit.max(1) as i64))
                    .await?
                    .check()?;
                Ok(response)
            }
        })
        .await?;

    let records: Vec<SurrealValue> = response.take(0)?;
    Ok(records
        .into_iter()
        .map(SurrealValue::into_json_value)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::get_entity;
    use crate::{GraphClient, GraphConfig};
    use futures_util::future::join_all;

    /// Diagnostic for the Lot 5 `/graph/neighbors` latency gate (<200ms):
    /// isolates whether `get_entity`'s cost is per-call (SDK/network) or
    /// something specific to `api::graph_api::build_snapshot`'s usage of it.
    /// Run with `--nocapture` — see the task's verification output for a
    /// captured run and the root cause it revealed.
    #[tokio::test]
    #[ignore = "requires external surrealdb env; diagnostic, not a correctness assertion"]
    async fn diagnose_get_entity_call_latency() -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }
        let client = GraphClient::connect(&GraphConfig::from_env()).await?;

        let start = std::time::Instant::now();
        get_entity(&client, "zone", "north-america").await?;
        println!(
            "DIAG single_call_ms={:.2}",
            start.elapsed().as_secs_f64() * 1000.0
        );

        let start = std::time::Instant::now();
        for _ in 0..10 {
            get_entity(&client, "zone", "north-america").await?;
        }
        println!(
            "DIAG ten_sequential_ms={:.2}",
            start.elapsed().as_secs_f64() * 1000.0
        );

        let start = std::time::Instant::now();
        join_all((0..10).map(|_| get_entity(&client, "zone", "north-america"))).await;
        println!(
            "DIAG ten_concurrent_join_all_ms={:.2}",
            start.elapsed().as_secs_f64() * 1000.0
        );

        Ok(())
    }
}
