use serde_json::Value;

use crate::GraphClient;

pub async fn upsert(
    client: &GraphClient,
    table: &str,
    id: &str,
    payload: Value,
) -> anyhow::Result<Value> {
    let mut response = client
        .db()
        .query("UPDATE type::thing($table, $id) MERGE $payload RETURN AFTER;")
        .bind(("table", table))
        .bind(("id", id))
        .bind(("payload", payload))
        .await?;

    let record: Option<Value> = response.take(0)?;
    Ok(record.unwrap_or(Value::Null))
}
