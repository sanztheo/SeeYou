use std::{collections::hash_map::DefaultHasher, fs, hash::Hasher, path::Path};

use anyhow::Context;
use geojson::{Feature, GeoJson, Geometry};
use serde_json::{Map, Value};

use crate::{
    entities,
    zone_geometry::{polygons_from_geometry, ZoneIndex},
    GraphClient,
};

#[derive(Debug, Clone)]
pub struct ZoneSeedStats {
    pub upserted: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ZoneMatch {
    pub zone_id: String,
    pub zone_type: Option<String>,
    pub distance_m: f64,
    pub contains: bool,
}

#[derive(Debug, Clone)]
pub struct ZoneLookup {
    zones: Vec<ZoneIndex>,
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
        entities::upsert(client, "zone", &id, payload)
            .await
            .with_context(|| format!("failed upserting zone id={id} index={idx}"))?;
        upserted += 1;
    }

    Ok(ZoneSeedStats { upserted })
}

impl ZoneLookup {
    pub fn from_geojson_path(file_path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let raw = fs::read_to_string(file_path.as_ref()).with_context(|| {
            format!(
                "failed to read zones file: {}",
                file_path.as_ref().display()
            )
        })?;
        Self::from_geojson_str(&raw)
    }

    pub fn from_geojson_str(raw: &str) -> anyhow::Result<Self> {
        let geojson = raw.parse::<GeoJson>()?;
        Self::from_geojson(geojson)
    }

    pub fn from_geojson(geojson: GeoJson) -> anyhow::Result<Self> {
        let features = match geojson {
            GeoJson::FeatureCollection(collection) => collection.features,
            GeoJson::Feature(feature) => vec![feature],
            _ => return Ok(Self { zones: Vec::new() }),
        };

        let mut zones = Vec::new();
        for (idx, feature) in features.into_iter().enumerate() {
            let Some(geometry) = feature.geometry.as_ref() else {
                continue;
            };

            let polygons = polygons_from_geometry(geometry)
                .with_context(|| format!("failed to parse zone geometry index={idx}"))?;
            let zone_id = zone_id(&feature, idx);
            let zone_type = feature
                .property("zone_type")
                .or_else(|| feature.property("type"))
                .and_then(Value::as_str)
                .map(ToString::to_string);

            if let Some(zone) = ZoneIndex::new(zone_id, zone_type, polygons) {
                zones.push(zone);
            }
        }

        Ok(Self { zones })
    }

    pub fn lookup(&self, lat: f64, lon: f64) -> Vec<ZoneMatch> {
        let mut contains_matches = Vec::new();
        let mut nearest: Option<ZoneMatch> = None;

        for zone in &self.zones {
            let contains = zone.contains(lat, lon);
            if contains {
                contains_matches.push(ZoneMatch {
                    zone_id: zone.zone_id.clone(),
                    zone_type: zone.zone_type.clone(),
                    distance_m: 0.0,
                    contains: true,
                });
                continue;
            }

            if let Some(current_nearest) = nearest.as_ref() {
                let bbox_distance = zone.bbox_distance_m(lat, lon);
                if bbox_distance > current_nearest.distance_m + 1e-3 {
                    continue;
                }
            }

            let candidate = ZoneMatch {
                zone_id: zone.zone_id.clone(),
                zone_type: zone.zone_type.clone(),
                distance_m: zone.distance_m(lat, lon),
                contains: false,
            };

            let replace_nearest = nearest
                .as_ref()
                .map(|current| {
                    candidate.distance_m < current.distance_m
                        || (candidate.distance_m == current.distance_m
                            && candidate.zone_id < current.zone_id)
                })
                .unwrap_or(true);

            if replace_nearest {
                nearest = Some(candidate);
            }
        }

        if !contains_matches.is_empty() {
            contains_matches.sort_by(|a, b| a.zone_id.cmp(&b.zone_id));
            return contains_matches;
        }

        nearest.into_iter().collect()
    }

    pub fn is_empty(&self) -> bool {
        self.zones.is_empty()
    }

    pub fn len(&self) -> usize {
        self.zones.len()
    }
}

fn zone_payload(feature: &Feature, _geometry: Geometry, id: &str) -> Value {
    let mut payload = Map::new();
    payload.insert("id".to_string(), Value::String(id.to_string()));

    if let Some(props) = &feature.properties {
        for (key, value) in props {
            payload.insert(key.clone(), value.clone());
        }
    }

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

#[cfg(test)]
mod tests {
    use super::ZoneLookup;

    #[test]
    fn lookup_returns_containing_zone() {
        let lookup = ZoneLookup::from_geojson_str(sample_geojson()).expect("lookup");
        let matches = lookup.lookup(0.5, 0.5);

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].zone_id, "outer");
        assert!(matches[0].contains);
        assert_eq!(matches[0].distance_m, 0.0);
    }

    #[test]
    fn lookup_returns_all_overlapping_zones() {
        let lookup = ZoneLookup::from_geojson_str(sample_geojson()).expect("lookup");
        let matches = lookup.lookup(1.5, 1.5);

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].zone_id, "inner");
        assert_eq!(matches[1].zone_id, "outer");
        assert!(matches.iter().all(|m| m.contains));
    }

    #[test]
    fn lookup_returns_nearest_zone_when_no_containment() {
        let lookup = ZoneLookup::from_geojson_str(sample_geojson()).expect("lookup");
        let matches = lookup.lookup(2.6, 0.5);

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].zone_id, "outer");
        assert!(!matches[0].contains);
        assert!(matches[0].distance_m > 0.0);
    }

    fn sample_geojson() -> &'static str {
        r#"
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "id": "outer", "zone_type": "region" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[0.0,0.0],[2.0,0.0],[2.0,2.0],[0.0,2.0],[0.0,0.0]]]
      }
    },
    {
      "type": "Feature",
      "properties": { "id": "inner", "zone_type": "city" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[1.0,1.0],[2.0,1.0],[2.0,2.0],[1.0,2.0],[1.0,1.0]]]
      }
    }
  ]
}
"#
    }
}
