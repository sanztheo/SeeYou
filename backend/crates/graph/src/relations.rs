use serde_json::{json, Value};

use crate::GraphClient;

const RELATION_UPSERT_QUERY: &str = r#"
UPSERT type::thing($relation, $edge_id) CONTENT {
    in: type::thing($from_table, $from_id),
    out: type::thing($to_table, $to_id)
};
UPDATE type::thing($relation, $edge_id) MERGE $attributes;
"#;

const SWEEP_EXPIRED_QUERY: &str = r#"
DELETE FROM type::table($relation_table)
WHERE expires_at IS NOT NONE
  AND expires_at < time::now()
RETURN BEFORE;
"#;

pub async fn link(
    client: &GraphClient,
    from_table: &str,
    from_id: &str,
    relation: &str,
    to_table: &str,
    to_id: &str,
    attributes: Option<Value>,
) -> anyhow::Result<()> {
    link_with_attributes(
        client,
        from_table,
        from_id,
        relation,
        to_table,
        to_id,
        attributes.unwrap_or_else(|| json!({})),
    )
    .await
}

pub async fn link_with_attributes(
    client: &GraphClient,
    from_table: &str,
    from_id: &str,
    relation: &str,
    to_table: &str,
    to_id: &str,
    attributes: Value,
) -> anyhow::Result<()> {
    let edge_id = deterministic_edge_id(relation, from_table, from_id, to_table, to_id);
    client
        .db()
        .query(RELATION_UPSERT_QUERY)
        .bind(("from_table", from_table))
        .bind(("from_id", from_id))
        .bind(("relation", relation))
        .bind(("edge_id", edge_id))
        .bind(("to_table", to_table))
        .bind(("to_id", to_id))
        .bind(("attributes", attributes))
        .await?;

    Ok(())
}

pub fn relation_attributes(
    expires_at: Option<&str>,
    timestamp: Option<&str>,
    score: Option<f64>,
    source: Option<&str>,
    extra: Option<Value>,
) -> Value {
    let mut payload = extra.unwrap_or_else(|| json!({}));
    if !payload.is_object() {
        payload = json!({ "data": payload });
    }

    if let Some(value) = expires_at {
        payload["expires_at"] = Value::String(value.to_string());
    }
    if let Some(value) = timestamp {
        payload["timestamp"] = Value::String(value.to_string());
    }
    if let Some(value) = score {
        payload["score"] = json!(value);
    }
    if let Some(value) = source {
        payload["source"] = Value::String(value.to_string());
    }

    payload
}

pub async fn sweep_expired_relations(
    client: &GraphClient,
    relation_tables: &[&str],
) -> anyhow::Result<usize> {
    let mut removed = 0usize;

    for relation_table in relation_tables {
        let mut response = client
            .db()
            .query(SWEEP_EXPIRED_QUERY)
            .bind(("relation_table", *relation_table))
            .await?;

        let deleted: Vec<Value> = response.take(0)?;
        removed += deleted.len();
    }

    Ok(removed)
}

fn deterministic_edge_id(
    relation: &str,
    from_table: &str,
    from_id: &str,
    to_table: &str,
    to_id: &str,
) -> String {
    let canonical = format!(
        "{relation}|{from_table}:{from_id}|{to_table}:{to_id}",
        relation = relation,
        from_table = from_table,
        from_id = from_id,
        to_table = to_table,
        to_id = to_id
    );
    format!("{:016x}", fnv1a64(canonical.as_bytes()))
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x00000100000001B3;

    let mut hash = OFFSET_BASIS;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::{deterministic_edge_id, relation_attributes, SWEEP_EXPIRED_QUERY};
    use serde_json::json;

    #[test]
    fn deterministic_edge_id_is_stable() {
        let id_a = deterministic_edge_id("located_in", "aircraft", "abc", "zone", "paris");
        let id_b = deterministic_edge_id("located_in", "aircraft", "abc", "zone", "paris");

        assert_eq!(id_a, id_b);
    }

    #[test]
    fn deterministic_edge_id_changes_on_direction() {
        let forward = deterministic_edge_id("located_in", "aircraft", "abc", "zone", "paris");
        let reverse = deterministic_edge_id("located_in", "zone", "paris", "aircraft", "abc");

        assert_ne!(forward, reverse);
    }

    #[test]
    fn relation_attributes_merges_metadata_fields() {
        let payload = relation_attributes(
            Some("2026-03-06T00:00:00Z"),
            Some("2026-03-05T23:59:59Z"),
            Some(0.87),
            Some("tracker"),
            Some(json!({ "kind": "ephemeral" })),
        );

        assert_eq!(payload["kind"], "ephemeral");
        assert_eq!(payload["expires_at"], "2026-03-06T00:00:00Z");
        assert_eq!(payload["timestamp"], "2026-03-05T23:59:59Z");
        assert_eq!(payload["score"], 0.87);
        assert_eq!(payload["source"], "tracker");
    }

    #[test]
    fn sweep_query_targets_expired_edges() {
        assert!(SWEEP_EXPIRED_QUERY.contains("DELETE FROM type::table($relation_table)"));
        assert!(SWEEP_EXPIRED_QUERY.contains("expires_at < time::now()"));
    }
}
