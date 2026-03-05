use anyhow::Context;
use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};
use std::time::Instant;
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

        let mut response = self
            .client
            .db()
            .query("SELECT * FROM type::table($table);")
            .bind(("table", table))
            .await
            .with_context(|| format!("failed to query entities from table={table}"))?;

        let records: Vec<Value> = response
            .take(0)
            .with_context(|| format!("failed to decode entities from table={table}"))?;

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
    use graph::zones::ZoneMatch;

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
}
