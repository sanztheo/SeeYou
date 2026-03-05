use std::{collections::hash_map::DefaultHasher, collections::HashSet, hash::Hasher};

use bus::topics;
use serde_json::{json, Value};

use crate::geo::extract_visibility_m;

fn values_from_key(payload: &Value, key: &str) -> Vec<Value> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.to_vec())
        .unwrap_or_default()
}

fn extract_entities(payload: &Value, key: &str) -> Vec<Value> {
    if let Some(items) = payload.as_array() {
        return items.to_vec();
    }

    let by_key = values_from_key(payload, key);
    if !by_key.is_empty() {
        return by_key;
    }

    vec![payload.clone()]
}

pub(crate) fn extract_records_for_topic(
    topic: &str,
    payload: &Value,
) -> Vec<(&'static str, Value)> {
    match topic {
        topics::AIRCRAFT => extract_entities(payload, "aircraft")
            .into_iter()
            .map(|v| ("aircraft", v))
            .collect(),
        topics::CAMERAS => extract_entities(payload, "cameras")
            .into_iter()
            .map(|v| ("camera", v))
            .collect(),
        topics::TRAFFIC => extract_entities(payload, "segments")
            .into_iter()
            .map(|v| ("traffic_segment", v))
            .collect(),
        topics::WEATHER => extract_entities(payload, "points")
            .into_iter()
            .map(|v| ("weather", v))
            .collect(),
        topics::METAR => extract_entities(payload, "stations")
            .into_iter()
            .map(|v| ("weather", v))
            .collect(),
        topics::SATELLITES => extract_entities(payload, "satellites")
            .into_iter()
            .map(|v| ("satellite", v))
            .collect(),
        topics::EVENTS => extract_entities(payload, "events")
            .into_iter()
            .map(|v| ("event", v))
            .collect(),
        topics::SEISMIC => extract_entities(payload, "earthquakes")
            .into_iter()
            .map(|v| ("seismic_event", v))
            .collect(),
        topics::FIRES => extract_entities(payload, "fires")
            .into_iter()
            .map(|v| ("fire_hotspot", v))
            .collect(),
        topics::GDELT => extract_entities(payload, "events")
            .into_iter()
            .map(|v| ("gdelt_event", v))
            .collect(),
        topics::MARITIME => extract_entities(payload, "vessels")
            .into_iter()
            .map(|v| ("vessel", v))
            .collect(),
        topics::CYBER => extract_entities(payload, "threats")
            .into_iter()
            .map(|v| ("cyber_threat", v))
            .collect(),
        topics::SPACE_WEATHER => {
            let mut out = Vec::new();
            out.extend(
                values_from_key(payload, "aurora")
                    .into_iter()
                    .map(|v| ("aurora_point", v)),
            );
            out.extend(
                values_from_key(payload, "alerts")
                    .into_iter()
                    .map(|v| ("space_weather_alert", v)),
            );
            if out.is_empty() {
                out.extend(
                    extract_entities(payload, "alerts")
                        .into_iter()
                        .map(|v| ("space_weather_event", v)),
                );
            }
            out
        }
        topics::CABLES => {
            let mut out = Vec::new();
            out.extend(
                values_from_key(payload, "cables")
                    .into_iter()
                    .map(|v| ("cable", v)),
            );
            out.extend(
                values_from_key(payload, "landing_points")
                    .into_iter()
                    .map(|v| ("landing_point", v)),
            );
            if out.is_empty() {
                out.extend(
                    extract_entities(payload, "cables")
                        .into_iter()
                        .map(|v| ("cable", v)),
                );
            }
            out
        }
        topics::MILITARY_BASES => extract_entities(payload, "bases")
            .into_iter()
            .map(|v| ("military_base", v))
            .collect(),
        topics::NUCLEAR_SITES => extract_entities(payload, "sites")
            .into_iter()
            .map(|v| ("nuclear_site", v))
            .collect(),
        _ => Vec::new(),
    }
}

pub(crate) fn resolve_entity_id(table: &str, key: Option<&str>, payload: &Value) -> String {
    if let Some(key) = key.filter(|k| !k.is_empty()) {
        return key.to_string();
    }

    let candidates = [
        "id",
        "icao",
        "icao24",
        "hex",
        "segment_id",
        "station_id",
        "mmsi",
        "norad_id",
        "event_id",
    ];

    for candidate in candidates {
        if let Some(value) = payload.get(candidate) {
            if let Some(as_str) = value.as_str() {
                if !as_str.is_empty() {
                    return as_str.to_string();
                }
            }
            if let Some(as_u64) = value.as_u64() {
                return as_u64.to_string();
            }
            if let Some(as_i64) = value.as_i64() {
                return as_i64.to_string();
            }
        }
    }

    let mut hasher = DefaultHasher::new();
    hasher.write(format!("{table}:{payload}").as_bytes());
    format!("{}_{}", table, hasher.finish())
}

pub(crate) fn resolve_zone_ids(payload: &Value) -> Vec<String> {
    let mut zone_ids = Vec::new();

    if let Some(zone_id) = payload.get("zone_id").and_then(Value::as_str) {
        zone_ids.push(zone_id.to_string());
    }

    if let Some(located_in) = payload.get("located_in").and_then(Value::as_str) {
        zone_ids.push(located_in.to_string());
    }

    if let Some(values) = payload.get("zone_ids").and_then(Value::as_array) {
        for value in values {
            if let Some(zone_id) = value.as_str() {
                zone_ids.push(zone_id.to_string());
            }
        }
    }

    dedup_zone_ids(zone_ids)
}

pub(crate) fn dedup_zone_ids(zone_ids: Vec<String>) -> Vec<String> {
    let mut deduped = HashSet::new();
    let mut out = Vec::new();

    for zone_id in zone_ids {
        if zone_id.is_empty() || !deduped.insert(zone_id.clone()) {
            continue;
        }
        out.push(zone_id);
    }

    out.sort();
    out
}

pub(crate) fn extract_record_id(table: &str, payload: &Value) -> Option<String> {
    let record_id = payload.get("id")?;

    if let Some(as_str) = record_id.as_str() {
        return Some(normalize_record_id(table, as_str));
    }

    if let Some(as_obj) = record_id.as_object() {
        if let Some(id) = as_obj.get("id").and_then(Value::as_str) {
            return Some(id.to_string());
        }
        if let Some(id) = as_obj.get("value").and_then(Value::as_str) {
            return Some(id.to_string());
        }
    }

    None
}

pub(crate) fn normalize_record_id(table: &str, raw_id: &str) -> String {
    let prefix = format!("{table}:");
    raw_id.strip_prefix(&prefix).unwrap_or(raw_id).to_string()
}

pub(crate) fn normalize_entity_payload(table: &str, payload: &Value) -> Value {
    let mut normalized = payload.clone();
    if table != "weather" {
        return normalized;
    }

    let Some(object) = normalized.as_object_mut() else {
        return normalized;
    };

    if object.get("visibility").is_none() {
        if let Some(visibility) = extract_visibility_m(payload) {
            object.insert("visibility".to_string(), json!(visibility));
        }
    }

    normalized
}

#[cfg(test)]
mod tests {
    use super::{dedup_zone_ids, normalize_entity_payload, normalize_record_id, resolve_zone_ids};
    use serde_json::json;

    #[test]
    fn resolve_zone_ids_deduplicates_fields() {
        let payload = json!({
            "zone_id": "paris",
            "located_in": "paris",
            "zone_ids": ["idf", "paris", "idf"]
        });
        let zone_ids = resolve_zone_ids(&payload);
        assert_eq!(zone_ids, vec!["idf".to_string(), "paris".to_string()]);
    }

    #[test]
    fn normalize_record_id_strips_table_prefix() {
        assert_eq!(normalize_record_id("camera", "camera:cam_1"), "cam_1");
        assert_eq!(normalize_record_id("camera", "cam_2"), "cam_2");
    }

    #[test]
    fn dedup_zone_ids_drops_empty_values() {
        let deduped = dedup_zone_ids(vec![
            "paris".to_string(),
            String::new(),
            "paris".to_string(),
            "idf".to_string(),
        ]);
        assert_eq!(deduped, vec!["idf".to_string(), "paris".to_string()]);
    }

    #[test]
    fn normalize_weather_payload_sets_visibility_field() {
        let normalized = normalize_entity_payload("weather", &json!({ "visibility_m": 740 }));
        assert_eq!(
            normalized.get("visibility").and_then(|v| v.as_f64()),
            Some(740.0)
        );
    }
}
