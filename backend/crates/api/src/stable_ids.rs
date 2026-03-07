use std::{collections::hash_map::DefaultHasher, hash::Hasher};

use serde_json::{Map, Value};

pub fn resolve_or_create_id(table: &str, payload: &Value) -> String {
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
    format!("{table}_{}", hasher.finish())
}

pub fn inject_stable_id(table: &str, payload: &mut Map<String, Value>) {
    if payload.contains_key("id") {
        return;
    }

    let id = resolve_or_create_id(table, &Value::Object(payload.clone()));
    payload.insert("id".to_string(), Value::String(id));
}

pub fn inject_stable_ids_in_array(table: &str, values: &mut [Value]) {
    for value in values {
        if let Some(object) = value.as_object_mut() {
            inject_stable_id(table, object);
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{inject_stable_ids_in_array, resolve_or_create_id};

    #[test]
    fn resolves_existing_id_first() {
        let payload = json!({ "id": "abc-123", "lat": 1.0, "lon": 2.0 });
        assert_eq!(resolve_or_create_id("fire_hotspot", &payload), "abc-123");
    }

    #[test]
    fn injects_hash_id_when_missing() {
        let mut values = vec![json!({ "lat": 48.0, "lon": 2.0, "title": "demo" })];
        inject_stable_ids_in_array("gdelt_event", &mut values);
        let id = values[0]
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert!(id.starts_with("gdelt_event_"));
    }
}
