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
