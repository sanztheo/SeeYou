use serde_json::{json, Value};

use crate::GraphClient;

pub async fn link(
    client: &GraphClient,
    from_table: &str,
    from_id: &str,
    relation: &str,
    to_table: &str,
    to_id: &str,
    attributes: Option<Value>,
) -> anyhow::Result<()> {
    client
        .db()
        .query(
            "RELATE type::thing($from_table, $from_id)->type::thing($relation)->type::thing($to_table, $to_id) CONTENT $attributes;",
        )
        .bind(("from_table", from_table))
        .bind(("from_id", from_id))
        .bind(("relation", relation))
        .bind(("to_table", to_table))
        .bind(("to_id", to_id))
        .bind(("attributes", attributes.unwrap_or_else(|| json!({}))))
        .await?;

    Ok(())
}
