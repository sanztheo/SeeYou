use anyhow::Context;
use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};
use std::time::Instant;
use surrealdb::types::Value as SurrealValue;
use tracing::info;

use crate::{
    consumer::{GraphBusConsumer, TableCacheEntry},
    geo::extract_lat_lon,
    payload::{dedup_zone_ids, normalize_entity_payload, resolve_entity_id, resolve_zone_ids},
};

impl GraphBusConsumer {
    pub(crate) async fn process_entity(
        &self,
        table: &str,
        entity_payload: &Value,
        topic: &str,
    ) -> anyhow::Result<()> {
        let normalized_payload = normalize_entity_payload(table, entity_payload);
        let entity_id = resolve_entity_id(table, None, &normalized_payload);
        graph::entities::upsert(&self.client, table, &entity_id, normalized_payload.clone())
            .await?;
        self.invalidate_table_cache(table).await;

        let location_zone_ids = self.resolve_location_zone_ids(&normalized_payload);

        match table {
            "aircraft" => {
                self.link_aircraft_relations(&entity_id, &normalized_payload, &location_zone_ids)
                    .await?;
            }
            "camera" | "traffic_segment" | "weather" => {
                self.link_to_zones(table, &entity_id, "located_in", &location_zone_ids, None)
                    .await?;
            }
            _ => {}
        }

        if table == "weather" {
            self.link_to_zones(table, &entity_id, "covers", &location_zone_ids, None)
                .await?;
            self.link_subjects_affected_by_weather(
                &entity_id,
                &normalized_payload,
                &location_zone_ids,
            )
            .await?;
        }

        if table == "satellite" {
            self.link_to_zones(table, &entity_id, "passes_over", &location_zone_ids, None)
                .await?;
        }

        if table == "traffic_segment" {
            self.link_subject_to_low_visibility_weather(table, &entity_id, &location_zone_ids)
                .await?;
        }

        info!(
            topic = %topic,
            table,
            entity_id = %entity_id,
            "graph entity upserted from bus envelope"
        );

        Ok(())
    }

    pub(crate) async fn process_entity_on_demand(
        &self,
        table: &str,
        entity_payload: &Value,
        _topic: &str,
    ) -> anyhow::Result<()> {
        let normalized_payload = normalize_entity_payload(table, entity_payload);
        let entity_id = resolve_entity_id(table, None, &normalized_payload);
        graph::entities::upsert(&self.client, table, &entity_id, normalized_payload.clone())
            .await
            .with_context(|| format!("failed to upsert on-demand entity {table}:{entity_id}"))?;
        self.invalidate_table_cache(table).await;

        let location_zone_ids = self.resolve_location_zone_ids(&normalized_payload);

        match table {
            "aircraft" => {
                let contains_zone_ids = self.resolve_contains_zone_ids(&normalized_payload);
                self.link_to_zones(
                    "aircraft",
                    &entity_id,
                    "flies_over",
                    &contains_zone_ids,
                    None,
                )
                .await
                .with_context(|| {
                    format!(
                        "failed to create flies_over relations on demand for aircraft:{entity_id}"
                    )
                })?;
            }
            "camera" | "traffic_segment" | "weather" => {
                self.link_to_zones(table, &entity_id, "located_in", &location_zone_ids, None)
                    .await
                    .with_context(|| {
                        format!(
                            "failed to create located_in relations on demand for {table}:{entity_id}"
                        )
                    })?;
            }
            _ => {}
        }

        if table == "weather" {
            self.link_to_zones(table, &entity_id, "covers", &location_zone_ids, None)
                .await
                .with_context(|| {
                    format!("failed to create covers relations on demand for {table}:{entity_id}")
                })?;
        }

        if table == "satellite" {
            self.link_to_zones(table, &entity_id, "passes_over", &location_zone_ids, None)
                .await
                .with_context(|| {
                    format!(
                        "failed to create passes_over relations on demand for {table}:{entity_id}"
                    )
                })?;
        }

        Ok(())
    }

    async fn link_aircraft_relations(
        &self,
        aircraft_id: &str,
        payload: &Value,
        location_zone_ids: &[String],
    ) -> anyhow::Result<()> {
        let contains_zone_ids = self.resolve_contains_zone_ids(payload);
        let attrs = Some(self.flies_over_attributes());
        self.link_to_zones(
            "aircraft",
            aircraft_id,
            "flies_over",
            &contains_zone_ids,
            attrs,
        )
        .await?;

        self.link_aircraft_to_nearby_cameras(aircraft_id, payload)
            .await?;
        self.link_subject_to_low_visibility_weather("aircraft", aircraft_id, location_zone_ids)
            .await?;

        Ok(())
    }

    pub(crate) async fn link_to_zones(
        &self,
        from_table: &str,
        from_id: &str,
        relation: &str,
        zone_ids: &[String],
        attributes: Option<Value>,
    ) -> anyhow::Result<()> {
        for zone_id in zone_ids {
            match attributes.as_ref() {
                Some(attrs) => {
                    graph::relations::link_with_attributes(
                        &self.client,
                        from_table,
                        from_id,
                        relation,
                        "zone",
                        zone_id,
                        attrs.clone(),
                    )
                    .await?;
                }
                None => {
                    graph::relations::link(
                        &self.client,
                        from_table,
                        from_id,
                        relation,
                        "zone",
                        zone_id,
                        None,
                    )
                    .await?;
                }
            }
        }

        Ok(())
    }

    pub(crate) async fn load_table_entities(&self, table: &str) -> anyhow::Result<Vec<Value>> {
        if let Some(cached_records) = self.cached_table_entities(table).await {
            return Ok(cached_records);
        }

        let table_name = table.to_string();
        let mut response = self
            .client
            .with_retry(move |db| {
                let table_name = table_name.clone();
                async move {
                    let response = db
                        .query("SELECT * FROM type::table($table);")
                        .bind(("table", table_name))
                        .await?
                        .check()?;
                    Ok(response)
                }
            })
            .await
            .with_context(|| format!("failed to query entities from table={table}"))?;

        let records: Vec<SurrealValue> = response
            .take(0)
            .with_context(|| format!("failed to decode entities from table={table}"))?;
        let records = records
            .into_iter()
            .map(SurrealValue::into_json_value)
            .collect::<Vec<_>>();

        self.store_table_entities_cache(table, records.clone())
            .await;

        Ok(records)
    }

    pub(crate) async fn invalidate_table_cache(&self, table: &str) {
        if self.table_cache_ttl.is_zero() {
            return;
        }

        self.table_cache.write().await.remove(table);
    }

    async fn cached_table_entities(&self, table: &str) -> Option<Vec<Value>> {
        if self.table_cache_ttl.is_zero() {
            return None;
        }

        let cache = self.table_cache.read().await;
        let entry = cache.get(table)?;
        (entry.loaded_at.elapsed() <= self.table_cache_ttl).then(|| entry.records.clone())
    }

    async fn store_table_entities_cache(&self, table: &str, records: Vec<Value>) {
        if self.table_cache_ttl.is_zero() {
            return;
        }

        self.table_cache.write().await.insert(
            table.to_string(),
            TableCacheEntry {
                loaded_at: Instant::now(),
                records,
            },
        );
    }

    pub(crate) fn resolve_location_zone_ids(&self, payload: &Value) -> Vec<String> {
        let zone_ids = resolve_zone_ids(payload);

        if let Some((lat, lon)) = extract_lat_lon(payload) {
            let matches = self.zone_lookup.lookup(lat, lon);
            return merge_location_zone_ids(zone_ids, matches, self.nearest_zone_max_distance_m);
        }

        dedup_zone_ids(zone_ids)
    }

    fn resolve_contains_zone_ids(&self, payload: &Value) -> Vec<String> {
        let Some((lat, lon)) = extract_lat_lon(payload) else {
            return Vec::new();
        };

        dedup_zone_ids(
            self.zone_lookup
                .lookup(lat, lon)
                .into_iter()
                .filter(|m| m.contains)
                .map(|m| m.zone_id)
                .collect(),
        )
    }

    fn flies_over_attributes(&self) -> Value {
        let now = Utc::now();
        let expires_at = (now + chrono::Duration::seconds(self.flies_over_ttl_seconds))
            .to_rfc3339_opts(SecondsFormat::Secs, true);
        let timestamp = now.to_rfc3339_opts(SecondsFormat::Secs, true);

        graph::relations::relation_attributes(
            Some(&expires_at),
            Some(&timestamp),
            None,
            Some("consumer_graph"),
            Some(json!({ "ttl_seconds": self.flies_over_ttl_seconds })),
        )
    }
}

fn merge_location_zone_ids(
    mut zone_ids: Vec<String>,
    matches: Vec<graph::zones::ZoneMatch>,
    nearest_zone_max_distance_m: f64,
) -> Vec<String> {
    let contains_matches: Vec<String> = matches
        .iter()
        .filter(|m| m.contains)
        .map(|m| m.zone_id.clone())
        .collect();

    if !contains_matches.is_empty() {
        zone_ids.extend(contains_matches);
    } else if let Some(nearest) = matches.first() {
        if nearest.distance_m <= nearest_zone_max_distance_m {
            zone_ids.push(nearest.zone_id.clone());
        }
    }

    dedup_zone_ids(zone_ids)
}

#[cfg(test)]
mod tests {
    use super::merge_location_zone_ids;
    use crate::consumer::GraphBusConsumer;
    use anyhow::Context;
    use chrono::Utc;
    use graph::zones::ZoneMatch;
    use serde_json::{json, Value};
    use std::fs;
    use std::time::Duration;

    const PARIS_TEST_ZONE_GEOJSON: &str = r#"
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "city-paris",
        "name": "Paris",
        "zone_type": "city"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[2.20,48.80],[2.20,48.90],[2.40,48.90],[2.40,48.80],[2.20,48.80]]]
      }
    }
  ]
}
"#;

    #[test]
    fn merge_location_zone_ids_prefers_contains_matches() {
        let zone_ids = vec!["known-zone".to_string()];
        let matches = vec![
            ZoneMatch {
                zone_id: "paris".to_string(),
                zone_type: Some("city".to_string()),
                distance_m: 0.0,
                contains: true,
            },
            ZoneMatch {
                zone_id: "idf".to_string(),
                zone_type: Some("region".to_string()),
                distance_m: 0.0,
                contains: true,
            },
        ];

        let merged = merge_location_zone_ids(zone_ids, matches, 50_000.0);
        assert_eq!(
            merged,
            vec![
                "idf".to_string(),
                "known-zone".to_string(),
                "paris".to_string()
            ]
        );
    }

    #[test]
    fn merge_location_zone_ids_uses_nearest_within_threshold() {
        let matches = vec![ZoneMatch {
            zone_id: "closest".to_string(),
            zone_type: Some("region".to_string()),
            distance_m: 5_000.0,
            contains: false,
        }];

        let merged = merge_location_zone_ids(Vec::new(), matches, 10_000.0);
        assert_eq!(merged, vec!["closest".to_string()]);
    }

    #[test]
    fn merge_location_zone_ids_ignores_nearest_outside_threshold() {
        let matches = vec![ZoneMatch {
            zone_id: "too-far".to_string(),
            zone_type: Some("region".to_string()),
            distance_m: 150_000.0,
            contains: false,
        }];

        let merged = merge_location_zone_ids(Vec::new(), matches, 100_000.0);
        assert!(merged.is_empty());
    }

    #[tokio::test]
    #[ignore = "requires external surrealdb env"]
    async fn phase2a_creates_flies_over_monitored_by_and_traversal() -> anyhow::Result<()> {
        let _ = dotenvy::dotenv();
        if std::env::var("SURREALDB_URL").is_err() {
            return Ok(());
        }

        let graph_config = graph::GraphConfig::from_env();
        let client = graph::GraphClient::connect(&graph_config)
            .await
            .context("failed to connect graph client")?;
        graph::ontology::migrate(&client)
            .await
            .context("failed graph ontology migrate")?;
        let zones_path = std::env::temp_dir().join(format!(
            "phase2a-zones-{}.geojson",
            Utc::now().timestamp_micros()
        ));
        fs::write(&zones_path, PARIS_TEST_ZONE_GEOJSON)
            .context("failed to write temporary phase2a zone file")?;
        graph::zones::seed_zones_from_file(&client, &zones_path)
            .await
            .context("failed to seed temporary phase2a zone")?;

        let zone_lookup = graph::zones::ZoneLookup::from_geojson_str(PARIS_TEST_ZONE_GEOJSON)
            .context("failed to build phase2a zone lookup")?;
        let graph_consumer = GraphBusConsumer::new_for_processing(
            client.clone(),
            zone_lookup,
            180,
            100_000.0,
            Duration::from_secs(0),
            Duration::from_millis(0),
        );

        let suffix = Utc::now().timestamp_micros();
        let aircraft_id = format!("phase2a-aircraft-{suffix}");
        let camera_id = format!("phase2a-camera-{suffix}");

        let camera_payload = json!({
            "id": camera_id,
            "name": "Test Camera",
            "lat": 48.8567,
            "lon": 2.3525
        });
        graph_consumer
            .process_entity("camera", &camera_payload, "tests.camera")
            .await
            .context("failed processing camera payload")?;

        let aircraft_payload = json!({
            "id": aircraft_id,
            "callsign": "N31MK",
            "lat": 48.8566,
            "lon": 2.3522,
            "altitude": 15175.0,
            "speed": 197.0
        });
        graph_consumer
            .process_entity("aircraft", &aircraft_payload, "tests.aircraft")
            .await
            .context("failed processing aircraft payload")?;

        let flies_over_sql = format!(
            "SELECT count() AS total FROM flies_over WHERE `in` = aircraft:`{}` AND out = zone:`city-paris` GROUP ALL;",
            aircraft_id
        );
        let mut flies_over_response = client
            .with_retry(move |db| {
                let flies_over_sql = flies_over_sql.clone();
                async move {
                    let response = db.query(flies_over_sql).await?.check()?;
                    Ok(response)
                }
            })
            .await
            .context("failed querying flies_over count")?;
        let flies_over_rows: Vec<Value> = flies_over_response.take(0)?;
        let flies_over_total = flies_over_rows
            .first()
            .and_then(|row| row.get("total"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        assert!(flies_over_total >= 1);

        let monitored_by_sql = format!(
            "SELECT count() AS total FROM monitored_by WHERE `in` = aircraft:`{}` AND out = camera:`{}` GROUP ALL;",
            aircraft_id, camera_id
        );
        let mut monitored_by_response = client
            .with_retry(move |db| {
                let monitored_by_sql = monitored_by_sql.clone();
                async move {
                    let response = db.query(monitored_by_sql).await?.check()?;
                    Ok(response)
                }
            })
            .await
            .context("failed querying monitored_by count")?;
        let monitored_by_rows: Vec<Value> = monitored_by_response.take(0)?;
        let monitored_by_total = monitored_by_rows
            .first()
            .and_then(|row| row.get("total"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        assert!(monitored_by_total >= 1);

        let traversal_sql =
            "SELECT <-flies_over<-aircraft.id AS aircraft_ids FROM zone:`city-paris`;";
        let mut traversal_response = client
            .with_retry(move |db| async move {
                let response = db.query(traversal_sql).await?.check()?;
                Ok(response)
            })
            .await
            .context("failed querying traversal ids from city-paris")?;
        let traversal_rows: Vec<Value> = traversal_response.take(0)?;
        let traversal_contains_aircraft = traversal_rows
            .first()
            .and_then(|row| row.get("aircraft_ids"))
            .and_then(Value::as_array)
            .map(|ids| {
                ids.iter().any(|id| {
                    id.as_str()
                        .map(|raw| raw.contains(&aircraft_id))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        assert!(traversal_contains_aircraft);

        let cleanup_sql = format!(
            "DELETE flies_over WHERE `in` = aircraft:`{aircraft_id}`; DELETE monitored_by WHERE `in` = aircraft:`{aircraft_id}`; DELETE aircraft:`{aircraft_id}`; DELETE camera:`{camera_id}`;"
        );
        client
            .with_retry(move |db| {
                let cleanup_sql = cleanup_sql.clone();
                async move {
                    db.query(cleanup_sql).await?.check()?;
                    Ok(())
                }
            })
            .await
            .context("failed running phase2a cleanup query")?;
        client
            .invalidate()
            .await
            .context("failed to invalidate surreal session after phase2a test")?;

        let _ = fs::remove_file(&zones_path);

        Ok(())
    }
}
