use std::{collections::hash_map::DefaultHasher, fs, hash::Hasher, path::Path};

use geojson::{Feature, GeoJson, Geometry};
use serde_json::{json, Map, Value};

use crate::{entities, GraphClient};

#[derive(Debug, Clone)]
pub struct ZoneSeedStats {
    pub upserted: usize,
}

pub async fn seed_zones_from_file(
    client: &GraphClient,
    file_path: impl AsRef<Path>,
) -> anyhow::Result<ZoneSeedStats> {
    let raw = fs::read_to_string(file_path)?;
    let geojson = raw.parse::<GeoJson>()?;

    let features = match geojson {
        GeoJson::FeatureCollection(collection) => collection.features,
        GeoJson::Feature(feature) => vec![feature],
        _ => Vec::new(),
    };

    let mut upserted = 0usize;
    for (idx, feature) in features.into_iter().enumerate() {
        let Some(geometry) = feature.geometry.clone() else {
            continue;
        };

        let id = zone_id(&feature, idx);
        let payload = zone_payload(&feature, geometry, &id);
        entities::upsert(client, "zone", &id, payload).await?;
        upserted += 1;
    }

    Ok(ZoneSeedStats { upserted })
}

fn zone_payload(feature: &Feature, geometry: Geometry, id: &str) -> Value {
    let mut payload = Map::new();
    payload.insert("id".to_string(), Value::String(id.to_string()));

    if let Some(props) = &feature.properties {
        for (key, value) in props {
            payload.insert(key.clone(), value.clone());
        }
    }

    payload.insert("geometry".to_string(), json!(geometry));
    Value::Object(payload)
}

fn zone_id(feature: &Feature, idx: usize) -> String {
    feature
        .property("id")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            feature
                .property("name")
                .and_then(Value::as_str)
                .map(|name| slugify(name, idx))
        })
        .unwrap_or_else(|| fallback_zone_id(feature, idx))
}

fn slugify(value: &str, idx: usize) -> String {
    let slug = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();

    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("zone-{idx}")
    } else {
        trimmed
    }
}

fn fallback_zone_id(feature: &Feature, idx: usize) -> String {
    let mut hasher = DefaultHasher::new();
    hasher.write(format!("{feature:?}").as_bytes());
    format!("zone-{idx}-{:x}", hasher.finish())
}
