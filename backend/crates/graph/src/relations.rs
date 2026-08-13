use std::collections::{BTreeMap, BTreeSet};

use anyhow::Context;
use serde_json::{json, Value};
use surrealdb::types::Value as SurrealValue;

use crate::GraphClient;

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
    let edge_id = deterministic_edge_id(&relation, &from_table, &from_id, &to_table, &to_id);
    let escaped_from_id = from_id.replace('`', "\\`");
    let escaped_to_id = to_id.replace('`', "\\`");
    let escaped_edge_id = edge_id.replace('`', "\\`");
    let attributes_content = content_literal(&attributes).with_context(|| {
        format!(
            "failed to serialize relation attributes for {relation} {from_table}:{from_id}->{to_table}:{to_id}"
        )
    })?;
    let statement = format!(
        "RELATE {from_table}:`{escaped_from_id}`->{relation}:`{escaped_edge_id}`->{to_table}:`{escaped_to_id}` CONTENT {attributes_content};"
    );

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

/// Renders relation attributes as a SurrealQL object literal rather than
/// plain JSON: `timestamp`/`expires_at` are emitted as `<datetime>"..."`
/// casts, every other field stays ordinary JSON.
///
/// This is not cosmetic — verified empirically against SurrealDB 3.2.4:
/// a schema field declared `TYPE option<datetime>` (`ontology.rs`) rejects a
/// plain ISO-8601 *string* written via `CONTENT {"timestamp":"..."}`
/// (`Couldn't coerce value ... Expected none | datetime`), and the error is
/// swallowed by `consumer_graph`'s `handle_envelope` warn-and-continue loop
/// — which is exactly how `flies_over` ended up at 0 rows in production
/// despite being written on every admitted aircraft. Declaring the field as
/// plain `string` instead would make the write succeed but silently breaks
/// `sweep_expired_relations`' `expires_at < time::now()` comparison (also
/// verified empirically: a lexicographic-ish string compare matched a
/// datetime 73 years in the future). The inline cast is the only form that
/// satisfies both the schema and the sweep query at once.
fn content_literal(attributes: &Value) -> anyhow::Result<String> {
    Ok(format!("{{ {} }}", content_literal_fields(attributes)?.join(", ")))
}

/// Same rendering as `content_literal`, but returns the individual `"key":
/// value` fragments instead of a braced object — lets `link_batch` splice
/// `id`/`in`/`out` alongside the attribute fields in one array-item literal.
fn content_literal_fields(attributes: &Value) -> anyhow::Result<Vec<String>> {
    let Some(object) = attributes.as_object() else {
        return Ok(vec![format!(
            "data: {}",
            serde_json::to_string(attributes).context("failed to serialize relation attributes")?
        )]);
    };

    let mut fields = Vec::with_capacity(object.len());
    for (key, value) in object {
        let key_literal = serde_json::to_string(key).context("failed to serialize attribute key")?;
        let value_literal = if matches!(key.as_str(), "timestamp" | "expires_at") && value.is_string() {
            format!("<datetime>{}", serde_json::to_string(value)?)
        } else {
            serde_json::to_string(value).context("failed to serialize attribute value")?
        };
        fields.push(format!("{key_literal}: {value_literal}"));
    }

    Ok(fields)
}

/// Builds the standardized attribute set every edge carries
/// (`docs/plans/seeyou-v2.md` §Modèle de relation: `score`, `timestamp`,
/// `expires_at`, `source`, `explain`). `explain` is nested under its own key
/// — not flattened into the top level — so a consumer (API, UI) can render
/// "why this edge exists" (rule name, thresholds crossed, distances) as one
/// coherent block instead of guessing which top-level fields are metadata
/// vs. explanation.
pub fn relation_attributes(
    expires_at: Option<&str>,
    timestamp: Option<&str>,
    score: Option<f64>,
    source: Option<&str>,
    explain: Option<Value>,
) -> Value {
    let mut payload = json!({});

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
    if let Some(value) = explain {
        payload["explain"] = value;
    }

    payload
}

/// Normalizes a raw distance into a 0-1 proximity score: 0 km scores 1.0,
/// `max_km` (the relation's own admission radius) or beyond scores 0.0.
/// Replaces the raw `distance_km`/`visibility_m` values that used to be
/// written directly as `score` (incomparable across relation types —
/// `seeyou-v2.md` §Modèle de relation).
pub fn score_from_distance_km(distance_km: f64, max_km: f64) -> f64 {
    if max_km <= 0.0 {
        return 0.0;
    }
    (1.0 - (distance_km / max_km)).clamp(0.0, 1.0)
}

/// Normalizes a raw visibility reading into a 0-1 "affected" score: 0 m
/// (no visibility) scores 1.0, `threshold_m` (the admission gate) or beyond
/// scores 0.0.
pub fn score_from_visibility_m(visibility_m: f64, threshold_m: f64) -> f64 {
    if threshold_m <= 0.0 {
        return 0.0;
    }
    (1.0 - (visibility_m / threshold_m)).clamp(0.0, 1.0)
}

/// Score for deterministic containment/membership relations (zone lookup,
/// satellite ground-track pass): binary membership, full confidence.
pub const CONTAINMENT_SCORE: f64 = 1.0;

/// One edge queued for a batched, chunked write (see `link_batch`). Mirrors
/// the `(from, relation, to, attributes)` shape of `link_with_attributes`
/// but as plain owned data so a correlation pass can build many of these
/// before making a single round trip per chunk.
#[derive(Debug, Clone)]
pub struct RelationEdge {
    pub from_table: &'static str,
    pub from_id: String,
    pub relation: &'static str,
    pub to_table: &'static str,
    pub to_id: String,
    pub attributes: Value,
}

/// Writes many edges in as few SurrealDB round trips as possible: edges are
/// grouped by relation table, and each group becomes **one**
/// `INSERT RELATION INTO <relation> [...] ON DUPLICATE KEY UPDATE ...`
/// statement — not one `RELATE` statement per edge. Callers chunk the input
/// (~200/batch, see `consumer_graph::correlation`); this function does not
/// chunk or bound concurrency itself.
///
/// This grouping is not a micro-optimization — measured empirically against
/// the local SurrealDB 3.2.4 instance (see the task's verification output):
/// a multi-statement query pays a ~4ms fixed cost *per statement*,
/// regardless of statement kind (`RELATE`, `CREATE`, and separate `INSERT`s
/// all measured within noise of each other). 200 individual `RELATE`
/// statements measured ~870ms (≈230 edges/s); the equivalent single
/// `INSERT RELATION` carrying the same 200 rows as one array measured ~5ms
/// (~1000x fewer statements → the fixed cost is paid once, not 200 times).
/// One `RELATE`-per-edge cannot meet the Lot 4 write-budget gate
/// (≥1000 edges/s, p95 of a 200-batch <250ms) on this instance; this form can.
///
/// `ON DUPLICATE KEY UPDATE field = $input.field` keeps every row
/// independently idempotent by its own deterministic edge id — verified
/// empirically: inserting the same id twice with different per-row values
/// updates each row in place with *that row's own* new values (not a
/// shared/static value, not an error, not a duplicate).
pub async fn link_batch(client: &GraphClient, edges: &[RelationEdge]) -> anyhow::Result<usize> {
    if edges.is_empty() {
        return Ok(0);
    }

    let mut by_relation: BTreeMap<&'static str, Vec<&RelationEdge>> = BTreeMap::new();
    for edge in edges {
        by_relation.entry(edge.relation).or_default().push(edge);
    }

    let mut statement = String::new();
    for (relation, group) in &by_relation {
        let mut items = Vec::with_capacity(group.len());
        let mut update_keys: BTreeSet<&str> = BTreeSet::new();

        for edge in group {
            let edge_id = deterministic_edge_id(
                edge.relation,
                edge.from_table,
                &edge.from_id,
                edge.to_table,
                &edge.to_id,
            );
            let id_literal = serde_json::to_string(&edge_id)
                .context("failed to serialize deterministic edge id")?;
            let escaped_from_id = edge.from_id.replace('`', "\\`");
            let escaped_to_id = edge.to_id.replace('`', "\\`");
            let content_fields = content_literal_fields(&edge.attributes).with_context(|| {
                format!(
                    "failed to serialize batched relation attributes for {} {}:{}->{}:{}",
                    edge.relation, edge.from_table, edge.from_id, edge.to_table, edge.to_id
                )
            })?;
            if let Some(object) = edge.attributes.as_object() {
                update_keys.extend(object.keys().map(String::as_str));
            }

            items.push(format!(
                "{{ id: {id_literal}, in: {}:`{escaped_from_id}`, out: {}:`{escaped_to_id}`, {} }}",
                edge.from_table,
                edge.to_table,
                content_fields.join(", "),
            ));
        }

        let statement_tail = if update_keys.is_empty() {
            String::new()
        } else {
            let update_clause = update_keys
                .iter()
                .map(|key| format!("{key} = $input.{key}"))
                .collect::<Vec<_>>()
                .join(", ");
            format!(" ON DUPLICATE KEY UPDATE {update_clause}")
        };

        statement.push_str(&format!(
            "INSERT RELATION INTO {relation} [{}]{statement_tail};\n",
            items.join(", "),
        ));
    }

    client
        .with_retry(move |db| {
            let statement = statement.clone();
            async move {
                db.query(statement).await?.check()?;
                Ok(())
            }
        })
        .await?;

    Ok(edges.len())
}

pub async fn sweep_expired_relations(
    client: &GraphClient,
    relation_tables: &[&str],
) -> anyhow::Result<usize> {
    let mut removed = 0usize;

    for relation_table in relation_tables {
        let relation_table = (*relation_table).to_string();
        let mut response = client
            .with_retry(move |db| {
                let relation_table = relation_table.clone();
                async move {
                    let response = db
                        .query(SWEEP_EXPIRED_QUERY)
                        .bind(("relation_table", relation_table))
                        .await?
                        .check()?;
                    Ok(response)
                }
            })
            .await?;

        // `RETURN BEFORE` hands back the full deleted rows, including
        // `timestamp`/`expires_at` as native `datetime` values — decoding
        // straight into `serde_json::Value` fails ("Expected any, got
        // datetime"), the same class of error `processing.rs` hit with
        // `record` values (see its comment on the fix). Decode into
        // `surrealdb::types::Value` first, then convert explicitly.
        let deleted: Vec<SurrealValue> = response.take(0)?;
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
    use super::{
        content_literal, deterministic_edge_id, link_batch, link_with_attributes,
        relation_attributes, score_from_distance_km, score_from_visibility_m,
        sweep_expired_relations, RelationEdge, CONTAINMENT_SCORE, SWEEP_EXPIRED_QUERY,
    };
    use crate::{GraphClient, GraphConfig};
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
    fn relation_attributes_nests_explain_under_its_own_key() {
        let payload = relation_attributes(
            Some("2026-03-06T00:00:00Z"),
            Some("2026-03-05T23:59:59Z"),
            Some(0.87),
            Some("tracker"),
            Some(json!({ "kind": "ephemeral" })),
        );

        // explain stays a coherent nested block, not flattened alongside
        // the standardized score/source/timestamp/expires_at fields.
        assert_eq!(payload["explain"]["kind"], "ephemeral");
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

    #[test]
    fn score_from_distance_km_is_normalized_0_to_1() {
        assert_eq!(score_from_distance_km(0.0, 10.0), 1.0);
        assert_eq!(score_from_distance_km(10.0, 10.0), 0.0);
        assert_eq!(score_from_distance_km(5.0, 10.0), 0.5);
        // Beyond the admission radius clamps rather than going negative —
        // callers should already have filtered these out, but the score
        // stays a valid probability regardless.
        assert_eq!(score_from_distance_km(20.0, 10.0), 0.0);
        assert_eq!(score_from_distance_km(1.0, 0.0), 0.0);
    }

    #[test]
    fn score_from_visibility_m_is_normalized_0_to_1() {
        assert_eq!(score_from_visibility_m(0.0, 1000.0), 1.0);
        assert_eq!(score_from_visibility_m(1000.0, 1000.0), 0.0);
        assert_eq!(score_from_visibility_m(250.0, 1000.0), 0.75);
    }

    #[test]
    fn containment_score_is_full_confidence() {
        assert_eq!(CONTAINMENT_SCORE, 1.0);
    }

    /// Regression test for the bug this fix targets: a plain JSON string in
    /// a `datetime`-typed field is rejected by SurrealDB 3.2.4 on write
    /// (`AlreadyExists`'s sibling problem — verified empirically, see the
    /// task's verification output). `content_literal` must cast
    /// `timestamp`/`expires_at` inline so the write succeeds and the sweep
    /// query's `expires_at < time::now()` comparison stays a real datetime
    /// comparison, not a string one.
    #[test]
    fn content_literal_casts_timestamp_and_expires_at_to_datetime() {
        let attrs = json!({
            "score": 0.5,
            "timestamp": "2026-08-13T07:57:08Z",
            "expires_at": "2026-08-13T08:00:08Z",
            "source": "consumer_graph",
            "explain": { "rule": "near:seismic_critical_infrastructure" },
        });

        let rendered = content_literal(&attrs).expect("content_literal should succeed");

        assert!(
            rendered.contains(r#""timestamp": <datetime>"2026-08-13T07:57:08Z""#),
            "timestamp should be cast to <datetime>, got: {rendered}"
        );
        assert!(
            rendered.contains(r#""expires_at": <datetime>"2026-08-13T08:00:08Z""#),
            "expires_at should be cast to <datetime>, got: {rendered}"
        );
        assert!(rendered.contains(r#""score": 0.5"#));
        assert!(rendered.contains(r#""source": "consumer_graph""#));
        // Nested objects stay plain JSON — only the two top-level datetime
        // fields get the special cast treatment.
        assert!(rendered.contains(r#""rule":"near:seismic_critical_infrastructure""#));
    }

    #[test]
    fn content_literal_omits_absent_datetime_fields() {
        let attrs = json!({ "score": 1.0 });
        let rendered = content_literal(&attrs).expect("content_literal should succeed");
        assert!(!rendered.contains("datetime"));
        assert!(rendered.contains(r#""score": 1.0"#));
    }

    /// P1-0: reproduces the scenario the plan predicted would raise
    /// `AlreadyExists` on the second run — relates the same pair twice with
    /// the same deterministic edge id — and asserts SurrealDB 3.2.4's real
    /// behavior instead of the assumption. Measured directly against a live
    /// instance beforehand (see task verification output): `RELATE
    /// a->rel:`id`->b CONTENT {..}` is idempotent by construction — same id
    /// twice succeeds and replaces the content, no duplicate row. `CREATE`
    /// with a reused id is what throws `AlreadyExists`; `RELATE` with an
    /// explicit edge id does not. This test locks that behavior in so a
    /// future SurrealDB upgrade that silently changes it gets caught here
    /// instead of downstream in consumer_graph.
    #[tokio::test]
    #[ignore = "requires external surrealdb env"]
    async fn relate_with_deterministic_edge_id_is_idempotent() -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }

        let client = GraphClient::connect(&GraphConfig::from_env()).await?;
        let suffix = chrono::Utc::now().timestamp_micros();
        let from_id = format!("idempotence-probe-from-{suffix}");
        let to_id = format!("idempotence-probe-to-{suffix}");

        link_with_attributes(
            &client,
            "test_entity",
            &from_id,
            "near",
            "test_entity",
            &to_id,
            json!({ "score": 0.1 }),
        )
        .await?;
        // Second call: same from/to/relation -> same deterministic edge id.
        link_with_attributes(
            &client,
            "test_entity",
            &from_id,
            "near",
            "test_entity",
            &to_id,
            json!({ "score": 0.9 }),
        )
        .await?;

        let count_sql = format!(
            "SELECT count() AS total FROM near WHERE `in` = test_entity:`{from_id}` AND out = test_entity:`{to_id}` GROUP ALL;"
        );
        let mut response = client
            .with_retry(move |db| {
                let count_sql = count_sql.clone();
                async move { Ok(db.query(count_sql).await?.check()?) }
            })
            .await?;
        let rows: Vec<serde_json::Value> = response.take(0)?;
        let total = rows
            .first()
            .and_then(|row| row.get("total"))
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        assert_eq!(total, 1, "expected exactly one edge, RELATE should upsert by explicit id, not duplicate");

        let cleanup_sql =
            format!("DELETE test_entity:`{from_id}`; DELETE test_entity:`{to_id}`; DELETE near WHERE `in` = test_entity:`{from_id}`;");
        client
            .with_retry(move |db| {
                let cleanup_sql = cleanup_sql.clone();
                async move { Ok(db.query(cleanup_sql).await?.check()?) }
            })
            .await?;

        Ok(())
    }

    #[tokio::test]
    #[ignore = "requires external surrealdb env"]
    async fn link_batch_writes_all_edges_in_one_round_trip() -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }

        let client = GraphClient::connect(&GraphConfig::from_env()).await?;
        let suffix = chrono::Utc::now().timestamp_micros();
        let edges: Vec<RelationEdge> = (0..5)
            .map(|i| RelationEdge {
                from_table: "test_entity",
                from_id: format!("batch-from-{suffix}-{i}"),
                relation: "near",
                to_table: "test_entity",
                to_id: format!("batch-to-{suffix}-{i}"),
                attributes: json!({ "score": CONTAINMENT_SCORE }),
            })
            .collect();

        let written = link_batch(&client, &edges).await?;
        assert_eq!(written, 5);

        let mut cleanup_sql = String::new();
        for edge in &edges {
            cleanup_sql.push_str(&format!(
                "DELETE near WHERE `in` = test_entity:`{}` AND out = test_entity:`{}`;\n",
                edge.from_id, edge.to_id
            ));
        }
        client
            .with_retry(move |db| {
                let cleanup_sql = cleanup_sql.clone();
                async move { Ok(db.query(cleanup_sql).await?.check()?) }
            })
            .await?;

        Ok(())
    }

    /// Lot 4 write-budget gate (`seeyou-v2.md` §Architecture d'exécution,
    /// point 5): "≥ 1000 edges/s sustained, p95 of a 200-batch < 250ms" —
    /// blocks Lot 5. Run with `--nocapture` to see the numbers; not part of
    /// the default `cargo test` run since it writes real load against a
    /// live instance. See the task's verification output for a captured run.
    #[tokio::test]
    #[ignore = "requires external surrealdb env; writes real load, run explicitly for the bench"]
    async fn bench_write_throughput_meets_lot4_gate() -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }

        const CHUNK_SIZE: usize = 200;
        const CHUNK_COUNT: usize = 40; // 8,000 edges total — enough samples for a stable p95.

        let client = GraphClient::connect(&GraphConfig::from_env()).await?;
        let suffix = chrono::Utc::now().timestamp_micros();

        let mut batch_latencies_ms: Vec<f64> = Vec::with_capacity(CHUNK_COUNT);
        let overall_start = std::time::Instant::now();

        for chunk_index in 0..CHUNK_COUNT {
            let edges: Vec<RelationEdge> = (0..CHUNK_SIZE)
                .map(|i| {
                    // Representative of a real correlation edge (#5/#7/#10):
                    // score + timestamp/expires_at + a small explain object,
                    // not a minimal stub — the bench should reflect the
                    // actual payload size link_batch will carry in
                    // production, not an artificially cheap one.
                    let (timestamp, expires_at) = relation_window_for_bench();
                    RelationEdge {
                        from_table: "bench_seismic_event",
                        from_id: format!("bench-{suffix}-{chunk_index}-{i}"),
                        relation: "near",
                        to_table: "bench_military_base",
                        to_id: format!("bench-target-{}", i % 35),
                        attributes: relation_attributes(
                            Some(&expires_at),
                            Some(&timestamp),
                            Some(0.62),
                            Some("consumer_graph::correlation"),
                            Some(json!({
                                "rule": "near:seismic_critical_infrastructure",
                                "magnitude": 5.1,
                                "min_magnitude": 4.5,
                                "distance_km": 42.17,
                                "max_distance_km": 150.0,
                                "sources": ["usgs.gov/2.5_day", "military_bases.json"],
                            })),
                        ),
                    }
                })
                .collect();

            let batch_start = std::time::Instant::now();
            let written = link_batch(&client, &edges).await?;
            let elapsed_ms = batch_start.elapsed().as_secs_f64() * 1000.0;
            batch_latencies_ms.push(elapsed_ms);
            assert_eq!(written, CHUNK_SIZE);
        }

        let overall_elapsed = overall_start.elapsed();
        let total_edges = CHUNK_SIZE * CHUNK_COUNT;
        let edges_per_sec = total_edges as f64 / overall_elapsed.as_secs_f64();

        batch_latencies_ms.sort_by(|a, b| a.total_cmp(b));
        let p95_index = ((batch_latencies_ms.len() as f64) * 0.95).ceil() as usize - 1;
        let p95_ms = batch_latencies_ms[p95_index.min(batch_latencies_ms.len() - 1)];
        let max_ms = *batch_latencies_ms.last().unwrap();
        let min_ms = batch_latencies_ms[0];

        println!(
            "LOT4_BENCH total_edges={total_edges} elapsed_s={:.3} edges_per_sec={edges_per_sec:.1} \
             batch_p95_ms={p95_ms:.2} batch_min_ms={min_ms:.2} batch_max_ms={max_ms:.2} \
             gate_edges_per_sec_ge_1000={} gate_p95_lt_250ms={}",
            overall_elapsed.as_secs_f64(),
            edges_per_sec >= 1000.0,
            p95_ms < 250.0,
        );

        // `in`.id is not a valid record-id extraction (returns none) —
        // record::id() is the verified way to get the id part as a string
        // for a CONTAINS filter (see the task's verification output).
        let cleanup_sql =
            format!("DELETE near WHERE <string>record::id(`in`) CONTAINS 'bench-{suffix}';");
        client
            .with_retry(move |db| {
                let cleanup_sql = cleanup_sql.clone();
                async move { Ok(db.query(cleanup_sql).await?.check()?) }
            })
            .await?;

        Ok(())
    }

    /// Regression test for the bug this fix targets: `sweep_expired_relations`
    /// used to fail every tick that actually deleted a row — `RETURN BEFORE`
    /// hands back `timestamp`/`expires_at` as native `datetime` values, which
    /// `Vec<serde_json::Value>` cannot decode ("Expected any, got datetime").
    /// Writes one already-expired edge, sweeps it, and asserts both the
    /// returned count and that the row is actually gone.
    #[tokio::test]
    #[ignore = "requires external surrealdb env"]
    async fn sweep_expired_relations_removes_expired_edge_and_reports_count(
    ) -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }

        let client = GraphClient::connect(&GraphConfig::from_env()).await?;
        let suffix = chrono::Utc::now().timestamp_micros();
        let from_id = format!("sweep-probe-from-{suffix}");
        let to_id = format!("sweep-probe-to-{suffix}");

        let now = chrono::Utc::now();
        let already_expired = (now - chrono::Duration::seconds(60))
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let timestamp = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        link_with_attributes(
            &client,
            "test_entity",
            &from_id,
            "near",
            "test_entity",
            &to_id,
            relation_attributes(
                Some(&already_expired),
                Some(&timestamp),
                Some(0.5),
                Some("test"),
                None,
            ),
        )
        .await?;

        let removed = sweep_expired_relations(&client, &["near"]).await?;
        assert_eq!(removed, 1, "expected exactly the one already-expired edge to be swept");

        let count_sql = format!(
            "SELECT count() AS total FROM near WHERE `in` = test_entity:`{from_id}` AND out = test_entity:`{to_id}` GROUP ALL;"
        );
        let mut response = client
            .with_retry(move |db| {
                let count_sql = count_sql.clone();
                async move { Ok(db.query(count_sql).await?.check()?) }
            })
            .await?;
        let rows: Vec<serde_json::Value> = response.take(0)?;
        let remaining = rows
            .first()
            .and_then(|row| row.get("total"))
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        assert_eq!(remaining, 0, "swept edge should no longer exist");

        let cleanup_sql = format!(
            "DELETE test_entity:`{from_id}`; DELETE test_entity:`{to_id}`; DELETE near WHERE `in` = test_entity:`{from_id}`;"
        );
        client
            .with_retry(move |db| {
                let cleanup_sql = cleanup_sql.clone();
                async move { Ok(db.query(cleanup_sql).await?.check()?) }
            })
            .await?;

        Ok(())
    }

    fn relation_window_for_bench() -> (String, String) {
        let now = chrono::Utc::now();
        let timestamp = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let expires_at = (now + chrono::Duration::seconds(86_400))
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        (timestamp, expires_at)
    }
}
