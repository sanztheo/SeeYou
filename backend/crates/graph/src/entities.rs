use std::collections::BTreeSet;

use anyhow::Context;
use serde_json::Value;

use crate::GraphClient;

pub async fn upsert(
    client: &GraphClient,
    table: &str,
    id: &str,
    mut payload: Value,
) -> anyhow::Result<()> {
    prune_nulls(&mut payload);

    if let Some(object) = payload.as_object_mut() {
        object.remove("id");
    }

    let escaped_id = id.replace('`', "\\`");
    let payload_json = serde_json::to_string(&payload)
        .with_context(|| format!("failed to serialize payload for {table}:{id}"))?;
    let statement = format!("UPSERT {table}:`{escaped_id}` MERGE {payload_json} RETURN AFTER;");

    client
        .with_retry(move |db| {
            let statement = statement.clone();
            async move {
                db.query(statement).await?.check()?;
                Ok(())
            }
        })
        .await?;

    Ok(())
}

/// Renders one `(id, payload)` row as a SurrealQL object literal for a
/// batched `INSERT INTO` statement, plus the field names it carries (the
/// caller unions these across the batch to build the `ON DUPLICATE KEY
/// UPDATE` clause). Applies the same null-pruning and `id`-field handling as
/// `upsert`, so a batched write is observably identical to sequential
/// `upsert` calls — only the round-trip count differs.
fn entity_literal(id: &str, payload: &Value) -> anyhow::Result<(String, Vec<String>)> {
    let mut payload = payload.clone();
    prune_nulls(&mut payload);
    if let Some(object) = payload.as_object_mut() {
        object.remove("id");
    }

    let id_literal =
        serde_json::to_string(id).with_context(|| format!("failed to serialize id {id}"))?;
    let mut field_literals = vec![format!("id: {id_literal}")];
    let mut fields = Vec::new();

    if let Some(object) = payload.as_object() {
        for (key, value) in object {
            let key_literal = serde_json::to_string(key)
                .with_context(|| format!("failed to serialize field {key} for id {id}"))?;
            let value_literal = serde_json::to_string(value)
                .with_context(|| format!("failed to serialize field {key} for id {id}"))?;
            field_literals.push(format!("{key_literal}: {value_literal}"));
            fields.push(key.clone());
        }
    }

    Ok((format!("{{ {} }}", field_literals.join(", ")), fields))
}

/// Writes many entities of the same table in one SurrealDB round trip via a
/// single `INSERT INTO <table> [...] ON DUPLICATE KEY UPDATE ...;`
/// statement, instead of one `UPSERT` per row — the same pattern
/// `relations::link_batch` uses for edges (see its doc comment: SurrealDB
/// 3.2.4 pays a fixed ~4ms cost per *statement*, not per row). This is what
/// takes the airport seed (5,272 rows) from ~2m44s of sequential `upsert`
/// calls down to a handful of round trips. Callers chunk the input
/// themselves (see `server::seed_airports`); this function does not chunk
/// on its own.
pub async fn upsert_batch(
    client: &GraphClient,
    table: &str,
    rows: &[(String, Value)],
) -> anyhow::Result<usize> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut items = Vec::with_capacity(rows.len());
    let mut update_keys: BTreeSet<String> = BTreeSet::new();

    for (id, payload) in rows {
        let (item, fields) = entity_literal(id, payload)
            .with_context(|| format!("failed to render {table}:{id} for batch upsert"))?;
        items.push(item);
        update_keys.extend(fields);
    }

    let update_clause = if update_keys.is_empty() {
        String::new()
    } else {
        let clause = update_keys
            .iter()
            .map(|key| format!("{key} = $input.{key}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!(" ON DUPLICATE KEY UPDATE {clause}")
    };

    let statement = format!("INSERT INTO {table} [{}]{update_clause};", items.join(", "));

    client
        .with_retry(move |db| {
            let statement = statement.clone();
            async move {
                db.query(statement).await?.check()?;
                Ok(())
            }
        })
        .await?;

    Ok(rows.len())
}

fn prune_nulls(value: &mut Value) {
    match value {
        Value::Object(object) => {
            object.retain(|_, inner| {
                prune_nulls(inner);
                !inner.is_null()
            });
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                prune_nulls(item);
            }
            items.retain(|item| !item.is_null());
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::{entity_literal, prune_nulls, upsert_batch};
    use crate::{GraphClient, GraphConfig};
    use serde_json::json;

    #[test]
    fn prune_nulls_removes_null_object_fields_recursively() {
        let mut payload = json!({
            "callsign": null,
            "meta": {
                "note": null,
                "source": "adsb"
            },
            "items": [
                { "id": 1, "value": null },
                null
            ]
        });

        prune_nulls(&mut payload);

        assert_eq!(
            payload,
            json!({
                "meta": { "source": "adsb" },
                "items": [
                    { "id": 1 }
                ]
            })
        );
    }

    #[test]
    fn entity_literal_embeds_id_and_drops_a_redundant_payload_id() {
        let payload = json!({ "id": "should-be-dropped", "name": "Paris CDG", "elevation_ft": 392 });

        let (literal, fields) = entity_literal("airport-cdg", &payload)
            .expect("entity_literal should succeed");

        assert!(literal.contains(r#"id: "airport-cdg""#));
        assert!(literal.contains(r#""name": "Paris CDG""#));
        assert!(literal.contains(r#""elevation_ft": 392"#));
        // Only one `id:` field — the payload's own "id" must not survive.
        assert_eq!(literal.matches("id:").count(), 1);
        assert!(!fields.contains(&"id".to_string()));
        assert!(fields.contains(&"name".to_string()));
    }

    #[test]
    fn entity_literal_prunes_null_fields_like_upsert_does() {
        let payload = json!({ "name": "Small Strip", "iata_code": null });

        let (literal, fields) = entity_literal("airport-small", &payload)
            .expect("entity_literal should succeed");

        assert!(!literal.contains("iata_code"));
        assert!(!fields.contains(&"iata_code".to_string()));
    }

    #[test]
    fn entity_literal_handles_a_payload_with_no_other_fields() {
        let (literal, fields) =
            entity_literal("bare-id", &json!({})).expect("entity_literal should succeed");

        assert_eq!(literal, r#"{ id: "bare-id" }"#);
        assert!(fields.is_empty());
    }

    /// Live round trip against SurrealDB 3.2.4, mirroring
    /// `relations::link_batch_writes_all_edges_in_one_round_trip`: one
    /// `INSERT INTO ... ON DUPLICATE KEY UPDATE ...` statement carrying
    /// several rows must both create new records at the given ids AND
    /// update them in place on a second call with different values.
    #[tokio::test]
    #[ignore = "requires external surrealdb env"]
    async fn upsert_batch_writes_all_rows_and_is_idempotent() -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }

        let client = GraphClient::connect(&GraphConfig::from_env()).await?;
        let suffix = chrono::Utc::now().timestamp_micros();
        let rows: Vec<(String, serde_json::Value)> = (0..5)
            .map(|i| {
                (
                    format!("batch-entity-{suffix}-{i}"),
                    json!({ "name": format!("row-{i}"), "seq": 1 }),
                )
            })
            .collect();

        let written = upsert_batch(&client, "test_entity", &rows).await?;
        assert_eq!(written, 5);

        // Second call, same ids, different values -- must update in place,
        // not duplicate or error.
        let updated_rows: Vec<(String, serde_json::Value)> = rows
            .iter()
            .map(|(id, _)| (id.clone(), json!({ "name": "updated", "seq": 2 })))
            .collect();
        upsert_batch(&client, "test_entity", &updated_rows).await?;

        let count_sql = format!(
            "SELECT count() AS total FROM test_entity WHERE string::starts_with(<string>record::id(id), 'batch-entity-{suffix}-') AND seq = 2 GROUP ALL;"
        );
        let mut response = client
            .with_retry(move |db| {
                let count_sql = count_sql.clone();
                async move { Ok(db.query(count_sql).await?.check()?) }
            })
            .await?;
        let result: Vec<serde_json::Value> = response.take(0)?;
        let total = result
            .first()
            .and_then(|row| row.get("total"))
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        assert_eq!(total, 5, "expected exactly 5 updated rows, no duplicates");

        let cleanup_sql =
            format!("DELETE test_entity WHERE string::starts_with(<string>record::id(id), 'batch-entity-{suffix}-');");
        client
            .with_retry(move |db| {
                let cleanup_sql = cleanup_sql.clone();
                async move { Ok(db.query(cleanup_sql).await?.check()?) }
            })
            .await?;

        Ok(())
    }
}
