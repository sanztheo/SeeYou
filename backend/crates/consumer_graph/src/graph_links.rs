use serde_json::{json, Value};

use crate::{
    consumer::GraphBusConsumer,
    correlation::relation_window,
    geo::{extract_visibility_m, intersects_zone_ids},
    payload::extract_record_id,
};
use graph::relations::score_from_visibility_m;

impl GraphBusConsumer {
    // #2 monitored_by (aircraft->camera) and #10 near (aircraft->military_base)
    // moved to the R-tree-backed `correlation::CorrelationEngine`
    // (`run_correlation_pass`, event-driven per bus envelope) — this used to
    // be a full `load_table_entities("camera")` scan (~11 020 rows) *per
    // admitted aircraft*, sequentially `.await`ed one RELATE at a time.

    /// #3 `subject -> affected_by -> weather` (existing relation; Lot 5
    /// asks only to verify/fix its score and TTL, not to rearchitect it —
    /// weather has a few dozen stations, no R-tree needed).
    pub(crate) async fn link_subject_to_low_visibility_weather(
        &self,
        subject_table: &str,
        subject_id: &str,
        subject_zone_ids: &[String],
    ) -> anyhow::Result<()> {
        if subject_zone_ids.is_empty() {
            return Ok(());
        }
        let (timestamp, expires_at) = relation_window(self.flies_over_ttl_seconds);
        let threshold_m = self.thresholds.weather_low_visibility_threshold_m;

        let weather_entities = self.load_table_entities("weather").await?;
        for weather_payload in weather_entities {
            let Some(visibility_m) = extract_visibility_m(&weather_payload) else {
                continue;
            };
            if visibility_m >= threshold_m {
                continue;
            }

            let Some(weather_id) = extract_record_id("weather", &weather_payload) else {
                continue;
            };

            let weather_zone_ids = self.resolve_location_zone_ids(&weather_payload);
            if !intersects_zone_ids(subject_zone_ids, &weather_zone_ids) {
                continue;
            }

            let score = score_from_visibility_m(visibility_m, threshold_m);
            let attrs = graph::relations::relation_attributes(
                Some(&expires_at),
                Some(&timestamp),
                Some(score),
                Some("consumer_graph"),
                Some(json!({
                    "rule": "affected_by:low_visibility_weather",
                    "visibility_m": visibility_m,
                    "visibility_threshold_m": threshold_m,
                    "ttl_seconds": self.flies_over_ttl_seconds,
                    "sources": ["metar"],
                })),
            );
            graph::relations::link_with_attributes(
                &self.client,
                subject_table,
                subject_id,
                "affected_by",
                "weather",
                &weather_id,
                attrs,
            )
            .await?;
        }

        Ok(())
    }

    pub(crate) async fn link_subjects_affected_by_weather(
        &self,
        weather_id: &str,
        weather_payload: &Value,
        weather_zone_ids: &[String],
    ) -> anyhow::Result<()> {
        let Some(visibility_m) = extract_visibility_m(weather_payload) else {
            return Ok(());
        };
        let threshold_m = self.thresholds.weather_low_visibility_threshold_m;
        if visibility_m >= threshold_m || weather_zone_ids.is_empty() {
            return Ok(());
        }
        let (timestamp, expires_at) = relation_window(self.flies_over_ttl_seconds);
        let score = score_from_visibility_m(visibility_m, threshold_m);

        for subject_table in ["aircraft", "traffic_segment"] {
            let subjects = self.load_table_entities(subject_table).await?;
            for subject_payload in subjects {
                let Some(subject_id) = extract_record_id(subject_table, &subject_payload) else {
                    continue;
                };
                let subject_zone_ids = self.resolve_location_zone_ids(&subject_payload);
                if !intersects_zone_ids(&subject_zone_ids, weather_zone_ids) {
                    continue;
                }

                let attrs = graph::relations::relation_attributes(
                    Some(&expires_at),
                    Some(&timestamp),
                    Some(score),
                    Some("consumer_graph"),
                    Some(json!({
                        "rule": "affected_by:low_visibility_weather",
                        "visibility_m": visibility_m,
                        "visibility_threshold_m": threshold_m,
                        "ttl_seconds": self.flies_over_ttl_seconds,
                        "sources": ["metar"],
                    })),
                );
                graph::relations::link_with_attributes(
                    &self.client,
                    subject_table,
                    &subject_id,
                    "affected_by",
                    "weather",
                    weather_id,
                    attrs,
                )
                .await?;
            }
        }

        Ok(())
    }
}
