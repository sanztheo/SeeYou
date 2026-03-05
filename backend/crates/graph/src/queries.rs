use serde_json::Value;

use crate::GraphClient;

pub async fn get_entity(
    client: &GraphClient,
    table: &str,
    id: &str,
) -> anyhow::Result<Option<Value>> {
    let mut response = client
        .db()
        .query("SELECT * FROM type::thing($table, $id);")
        .bind(("table", table))
        .bind(("id", id))
        .await?;

    let record: Option<Value> = response.take(0)?;
    Ok(record)
}

pub async fn get_neighbors(
    client: &GraphClient,
    table: &str,
    id: &str,
    depth: usize,
) -> anyhow::Result<Vec<Value>> {
    let mut response = client
        .db()
        .query(
            "SELECT ->* AS outgoing, <-* AS incoming FROM type::thing($table, $id) FETCH ->*, <-* LIMIT $depth;",
        )
        .bind(("table", table))
        .bind(("id", id))
        .bind(("depth", depth.max(1) as i64))
        .await?;

    let records: Vec<Value> = response.take(0)?;
    Ok(records)
}
