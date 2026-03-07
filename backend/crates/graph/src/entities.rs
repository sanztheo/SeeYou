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
    use super::prune_nulls;
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
}
