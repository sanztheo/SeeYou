use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};

use crate::{
    constants::{LOW_VISIBILITY_THRESHOLD_M, MONITORED_BY_MAX_DISTANCE_KM},
    consumer::GraphBusConsumer,
    geo::{extract_lat_lon, extract_visibility_m, haversine_km, intersects_zone_ids},
    payload::extract_record_id,
};

impl GraphBusConsumer {
    pub(crate) async fn link_aircraft_to_nearby_cameras(
        &self,
        aircraft_id: &str,
        aircraft_payload: &Value,
    ) -> anyhow::Result<()> {
        let Some((aircraft_lat, aircraft_lon)) = extract_lat_lon(aircraft_payload) else {
            return Ok(());
        };
        let (timestamp, expires_at) = self.ephemeral_relation_window();

        let cameras = self.load_table_entities("camera").await?;
        for camera_payload in cameras {
            let Some(camera_id) = extract_record_id("camera", &camera_payload) else {
                continue;
            };
            let Some((camera_lat, camera_lon)) = extract_lat_lon(&camera_payload) else {
                continue;
            };

            let distance_km = haversine_km(aircraft_lat, aircraft_lon, camera_lat, camera_lon);
            if distance_km < MONITORED_BY_MAX_DISTANCE_KM {
                let attrs = graph::relations::relation_attributes(
                    Some(&expires_at),
                    Some(&timestamp),
                    Some(distance_km),
                    Some("consumer_graph"),
                    Some(json!({ "ttl_seconds": self.flies_over_ttl_seconds })),
                );
                graph::relations::link_with_attributes(
                    &self.client,
                    "aircraft",
                    aircraft_id,
                    "monitored_by",
                    "camera",
                    &camera_id,
                    attrs,
                )
                .await?;
            }
        }

        Ok(())
    }

    pub(crate) async fn link_subject_to_low_visibility_weather(
        &self,
        subject_table: &str,
        subject_id: &str,
        subject_zone_ids: &[String],
    ) -> anyhow::Result<()> {
        if subject_zone_ids.is_empty() {
            return Ok(());
        }
        let (timestamp, expires_at) = self.ephemeral_relation_window();

        let weather_entities = self.load_table_entities("weather").await?;
        for weather_payload in weather_entities {
            let Some(visibility_m) = extract_visibility_m(&weather_payload) else {
                continue;
            };
            if visibility_m >= LOW_VISIBILITY_THRESHOLD_M {
                continue;
            }

            let Some(weather_id) = extract_record_id("weather", &weather_payload) else {
                continue;
            };

            let weather_zone_ids = self.resolve_location_zone_ids(&weather_payload);
            if !intersects_zone_ids(subject_zone_ids, &weather_zone_ids) {
                continue;
            }

            let attrs = graph::relations::relation_attributes(
                Some(&expires_at),
                Some(&timestamp),
                Some(visibility_m),
                Some("consumer_graph"),
                Some(json!({
                    "visibility_m": visibility_m,
                    "ttl_seconds": self.flies_over_ttl_seconds
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
        if visibility_m >= LOW_VISIBILITY_THRESHOLD_M || weather_zone_ids.is_empty() {
            return Ok(());
        }
        let (timestamp, expires_at) = self.ephemeral_relation_window();

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
                    Some(visibility_m),
                    Some("consumer_graph"),
                    Some(json!({
                        "visibility_m": visibility_m,
                        "ttl_seconds": self.flies_over_ttl_seconds
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

    fn ephemeral_relation_window(&self) -> (String, String) {
        let now = Utc::now();
        let timestamp = now.to_rfc3339_opts(SecondsFormat::Secs, true);
        let expires_at = (now + chrono::Duration::seconds(self.flies_over_ttl_seconds))
            .to_rfc3339_opts(SecondsFormat::Secs, true);

        (timestamp, expires_at)
    }
}
