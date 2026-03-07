use std::collections::{HashMap, HashSet};

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{info, warn};

const RELATION_TABLES: &[&str] = &[
    "located_in",
    "flies_over",
    "monitored_by",
    "affected_by",
    "triggered",
    "observes",
    "covers",
    "passes_over",
    "involves",
    "connects_to",
    "reports",
    "near",
    "targets",
    "derived_from",
];

const SEARCH_TABLES: &[&str] = &[
    "zone",
    "aircraft",
    "camera",
    "weather",
    "traffic_segment",
    "satellite",
    "event",
    "cable",
    "landing_point",
    "seismic_event",
    "fire_hotspot",
    "gdelt_event",
    "vessel",
    "cyber_threat",
    "space_weather_event",
    "aurora_point",
    "space_weather_alert",
    "military_base",
    "nuclear_site",
];

const DEFAULT_LIMIT: usize = 50;
const SEARCH_SCAN_LIMIT: usize = 250;
const MAX_DEPTH: usize = 2;
const MAX_LIMIT: usize = 300;

#[derive(Debug, Clone, Serialize)]
pub struct GraphRef {
    pub table: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphNode {
    #[serde(rename = "ref")]
    pub node_ref: GraphRef,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lon: Option<f64>,
    pub entity: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphEdge {
    #[serde(rename = "ref")]
    pub edge_ref: GraphRef,
    pub relation: String,
    pub from: GraphRef,
    pub to: GraphRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphSnapshot {
    pub root: GraphRef,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphSearchResult {
    #[serde(rename = "ref")]
    pub item_ref: GraphRef,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lon: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct NeighborQuery {
    pub depth: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct ZoneQuery {
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<usize>,
}

pub async fn get_entity_graph(
    Path((entity_type, id)): Path<(String, String)>,
    Query(query): Query<NeighborQuery>,
    State(redis_pool): State<cache::RedisPool>,
    State(graph_client): State<Option<graph::GraphClient>>,
) -> Result<Json<GraphSnapshot>, StatusCode> {
    let client = graph_client.ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let table = normalize_table_name(&entity_type).ok_or(StatusCode::NOT_FOUND)?;
    let limit = clamp_limit(query.limit);

    let snapshot = build_snapshot_with_hydration(&client, &redis_pool, table, &id, 1, limit)
        .await
        .map_err(|error| {
            warn!(entity_type = %table, entity_id = %id, error = %error, "graph entity snapshot failed");
            if graph::is_retryable_connection_error(&error) {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(snapshot))
}

pub async fn get_neighbors_graph(
    Path((entity_type, id)): Path<(String, String)>,
    Query(query): Query<NeighborQuery>,
    State(redis_pool): State<cache::RedisPool>,
    State(graph_client): State<Option<graph::GraphClient>>,
) -> Result<Json<GraphSnapshot>, StatusCode> {
    let client = graph_client.ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let table = normalize_table_name(&entity_type).ok_or(StatusCode::NOT_FOUND)?;
    let depth = query.depth.unwrap_or(2).clamp(1, MAX_DEPTH);
    let limit = clamp_limit(query.limit);

    let snapshot = build_snapshot_with_hydration(&client, &redis_pool, table, &id, depth, limit)
        .await
        .map_err(|error| {
            warn!(entity_type = %table, entity_id = %id, depth, error = %error, "graph neighbors snapshot failed");
            if graph::is_retryable_connection_error(&error) {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(snapshot))
}

pub async fn get_zone_graph(
    Path(zone_id): Path<String>,
    Query(query): Query<ZoneQuery>,
    State(graph_client): State<Option<graph::GraphClient>>,
) -> Result<Json<GraphSnapshot>, StatusCode> {
    let client = graph_client.ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let limit = clamp_limit(query.limit);

    let snapshot = build_snapshot(&client, "zone", &zone_id, 1, limit)
        .await
        .map_err(|error| {
            warn!(zone_id = %zone_id, error = %error, "graph zone snapshot failed");
            if graph::is_retryable_connection_error(&error) {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(snapshot))
}

pub async fn search_graph(
    Query(query): Query<SearchQuery>,
    State(graph_client): State<Option<graph::GraphClient>>,
) -> Result<Json<Vec<GraphSearchResult>>, StatusCode> {
    let client = graph_client.ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let needle = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::BAD_REQUEST)?
        .to_lowercase();
    let limit = clamp_limit(query.limit).min(100);

    let mut matches = Vec::new();
    for table in SEARCH_TABLES {
        let records = graph::queries::get_table_records(&client, table, SEARCH_SCAN_LIMIT)
            .await
            .map_err(|error| {
                if graph::is_retryable_connection_error(&error) {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                }
            })?;

        for record in records {
            let Some(node_id) = extract_entity_id(table, &record) else {
                continue;
            };
            if !record_matches(&record, &needle) {
                continue;
            }
            matches.push(GraphSearchResult {
                item_ref: GraphRef {
                    table: table.to_string(),
                    id: node_id.clone(),
                },
                label: build_label(table, &record, &node_id),
                subtitle: build_subtitle(table, &record),
                lat: extract_f64(&record, "lat"),
                lon: extract_f64(&record, "lon"),
            });

            if matches.len() >= limit {
                return Ok(Json(matches));
            }
        }
    }

    Ok(Json(matches))
}

async fn build_snapshot(
    client: &graph::GraphClient,
    root_table: &str,
    root_id: &str,
    depth: usize,
    limit: usize,
) -> anyhow::Result<Option<GraphSnapshot>> {
    let Some(root_entity) = graph::queries::get_entity(client, root_table, root_id).await? else {
        return Ok(None);
    };

    let root_ref = GraphRef {
        table: root_table.to_string(),
        id: root_id.to_string(),
    };

    let mut nodes: HashMap<String, GraphNode> = HashMap::new();
    let mut edges: HashMap<String, GraphEdge> = HashMap::new();
    let mut truncated = false;

    insert_node(&mut nodes, root_table, root_id, root_entity);

    let mut visited = HashSet::from([format!("{root_table}:{root_id}")]);
    let mut frontier = vec![root_ref.clone()];

    for level in 0..depth {
        let mut next_frontier = Vec::new();

        for current in &frontier {
            for relation in RELATION_TABLES {
                let relation_records = graph::queries::get_incident_relations(
                    client,
                    relation,
                    &current.table,
                    &current.id,
                    limit,
                )
                .await
                .map_err(|error| {
                    warn!(
                        relation,
                        current_table = %current.table,
                        current_id = %current.id,
                        error = %error,
                        "graph relation query failed"
                    );
                    error
                })?;

                for relation_record in relation_records {
                    let Some(from) = extract_ref_pair(&relation_record, "in_table", "in_id") else {
                        continue;
                    };
                    let Some(to) = extract_ref_pair(&relation_record, "out_table", "out_id") else {
                        continue;
                    };

                    let edge_key = format!(
                        "{}:{}:{}:{}:{}",
                        relation, from.table, from.id, to.table, to.id
                    );
                    if !edges.contains_key(&edge_key) {
                        let edge_ref_id = extract_entity_id(relation, &relation_record)
                            .unwrap_or_else(|| edge_key.clone());
                        let mut attributes = relation_record.clone();
                        if let Some(object) = attributes.as_object_mut() {
                            object.remove("id");
                            object.remove("in_table");
                            object.remove("in_id");
                            object.remove("out_table");
                            object.remove("out_id");
                            object.remove("in");
                            object.remove("out");
                        }
                        let has_attributes = attributes
                            .as_object()
                            .map(|attrs| !attrs.is_empty())
                            .unwrap_or(false);
                        edges.insert(
                            edge_key.clone(),
                            GraphEdge {
                                edge_ref: GraphRef {
                                    table: relation.to_string(),
                                    id: edge_ref_id,
                                },
                                relation: relation.to_string(),
                                from: from.clone(),
                                to: to.clone(),
                                attributes: has_attributes.then_some(attributes),
                            },
                        );
                    }

                    for neighbor in [from, to] {
                        let neighbor_key = format!("{}:{}", neighbor.table, neighbor.id);
                        if nodes.len() >= limit {
                            truncated = true;
                            break;
                        }
                        if !nodes.contains_key(&neighbor_key) {
                            if let Some(entity) =
                                graph::queries::get_entity(client, &neighbor.table, &neighbor.id)
                                    .await?
                            {
                                insert_node(&mut nodes, &neighbor.table, &neighbor.id, entity);
                            }
                        }
                        if level + 1 < depth && visited.insert(neighbor_key) {
                            next_frontier.push(neighbor);
                        }
                    }
                }
            }
        }

        frontier = next_frontier;
        if frontier.is_empty() {
            break;
        }
    }

    let mut nodes = nodes.into_values().collect::<Vec<_>>();
    nodes.sort_by(|a, b| {
        a.node_ref
            .table
            .cmp(&b.node_ref.table)
            .then(a.node_ref.id.cmp(&b.node_ref.id))
    });
    let mut edges = edges.into_values().collect::<Vec<_>>();
    edges.sort_by(|a, b| {
        a.relation
            .cmp(&b.relation)
            .then(a.from.table.cmp(&b.from.table))
            .then(a.from.id.cmp(&b.from.id))
            .then(a.to.table.cmp(&b.to.table))
            .then(a.to.id.cmp(&b.to.id))
    });

    Ok(Some(GraphSnapshot {
        root: root_ref,
        nodes,
        edges,
        truncated,
    }))
}

async fn build_snapshot_with_hydration(
    client: &graph::GraphClient,
    redis_pool: &cache::RedisPool,
    root_table: &str,
    root_id: &str,
    depth: usize,
    limit: usize,
) -> anyhow::Result<Option<GraphSnapshot>> {
    let snapshot = build_snapshot(client, root_table, root_id, depth, limit).await?;
    if snapshot.is_some() {
        return Ok(snapshot);
    }

    info!(
        entity_type = root_table,
        entity_id = root_id,
        depth,
        limit,
        "graph snapshot missing; attempting on-demand hydration"
    );

    let hydrated =
        super::graph_hydration::hydrate_entity_on_demand(client, redis_pool, root_table, root_id)
            .await?;
    if !hydrated {
        info!(
            entity_type = root_table,
            entity_id = root_id,
            "graph snapshot still missing after runtime lookup"
        );
        return Ok(None);
    }

    let snapshot = build_snapshot(client, root_table, root_id, depth, limit).await?;
    if snapshot.is_some() {
        info!(
            entity_type = root_table,
            entity_id = root_id,
            "graph snapshot resolved after on-demand hydration"
        );
    } else {
        warn!(
            entity_type = root_table,
            entity_id = root_id,
            "graph hydration completed but snapshot is still missing"
        );
    }
    Ok(snapshot)
}

fn insert_node(nodes: &mut HashMap<String, GraphNode>, table: &str, id: &str, entity: Value) {
    let key = format!("{table}:{id}");
    nodes.insert(
        key,
        GraphNode {
            node_ref: GraphRef {
                table: table.to_string(),
                id: id.to_string(),
            },
            label: build_label(table, &entity, id),
            subtitle: build_subtitle(table, &entity),
            lat: extract_f64(&entity, "lat"),
            lon: extract_f64(&entity, "lon"),
            entity,
        },
    );
}

fn clamp_limit(limit: Option<usize>) -> usize {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn record_matches(record: &Value, needle: &str) -> bool {
    let searchable_fields = [
        "id",
        "name",
        "title",
        "callsign",
        "city",
        "description",
        "country",
        "event_type",
        "type",
        "site_type",
    ];

    searchable_fields.iter().any(|field| {
        record
            .get(field)
            .map(stringify_value)
            .is_some_and(|value| value.to_lowercase().contains(needle))
    })
}

fn stringify_value(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => value.to_string(),
        _ => String::new(),
    }
}

fn extract_entity_id(table: &str, payload: &Value) -> Option<String> {
    payload
        .get("id")
        .and_then(extract_record_id)
        .or_else(|| {
            payload
                .get("id")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            payload
                .get("icao")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            payload
                .get("station_id")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            payload
                .get("segment_id")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            payload
                .get("mmsi")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            payload
                .get("norad_id")
                .and_then(Value::as_i64)
                .map(|v| v.to_string())
        })
        .or_else(|| {
            payload
                .get("id")
                .and_then(Value::as_u64)
                .map(|v| v.to_string())
        })
        .or_else(|| {
            payload.as_object().and_then(|map| {
                if map.is_empty() {
                    None
                } else {
                    Some(super::stable_ids::resolve_or_create_id(table, payload))
                }
            })
        })
}

fn extract_record_id(value: &Value) -> Option<String> {
    if let Some(as_str) = value.as_str() {
        return as_str
            .split_once(':')
            .map(|(_, id)| id.to_string())
            .or(Some(as_str.to_string()));
    }

    let object = value.as_object()?;
    if let Some(id) = object.get("id").and_then(Value::as_str) {
        return Some(id.to_string());
    }
    object
        .get("value")
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn extract_ref_pair(record: &Value, table_key: &str, id_key: &str) -> Option<GraphRef> {
    let table = record.get(table_key).and_then(Value::as_str)?.to_string();
    let id = record.get(id_key).and_then(Value::as_str)?.to_string();
    Some(GraphRef { table, id })
}

fn extract_f64(record: &Value, key: &str) -> Option<f64> {
    record.get(key).and_then(Value::as_f64)
}

fn build_label(table: &str, entity: &Value, fallback_id: &str) -> String {
    for key in ["name", "title", "callsign", "city", "description"] {
        if let Some(label) = entity
            .get(key)
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
        {
            return label.to_string();
        }
    }
    format!("{table}:{fallback_id}")
}

fn build_subtitle(table: &str, entity: &Value) -> Option<String> {
    let key_by_table = [
        ("aircraft", "icao"),
        ("camera", "source"),
        ("satellite", "category"),
        ("weather", "station_id"),
        ("zone", "type"),
        ("event", "type"),
        ("fire_hotspot", "satellite"),
        ("vessel", "mmsi"),
        ("military_base", "country"),
        ("nuclear_site", "country"),
    ];

    let key = key_by_table
        .iter()
        .find(|(candidate, _)| *candidate == table)
        .map(|(_, key)| *key)?;

    entity
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn normalize_table_name(raw: &str) -> Option<&'static str> {
    match raw.trim().to_lowercase().as_str() {
        "zone" | "zones" => Some("zone"),
        "aircraft" => Some("aircraft"),
        "camera" | "cameras" => Some("camera"),
        "weather" | "metar" => Some("weather"),
        "traffic" | "traffic_segment" | "traffic-segment" => Some("traffic_segment"),
        "satellite" | "satellites" => Some("satellite"),
        "event" | "events" => Some("event"),
        "alert" | "alerts" => Some("alert"),
        "cable" | "cables" => Some("cable"),
        "landing_point" | "landing-point" | "landing_points" => Some("landing_point"),
        "seismic" | "seismic_event" | "earthquake" | "earthquakes" => Some("seismic_event"),
        "fire" | "fires" | "fire_hotspot" => Some("fire_hotspot"),
        "gdelt" | "gdelt_event" => Some("gdelt_event"),
        "vessel" | "vessels" | "maritime" => Some("vessel"),
        "cyber" | "cyber_threat" | "threat" => Some("cyber_threat"),
        "space_weather" | "space-weather" | "space_weather_event" => Some("space_weather_event"),
        "aurora" | "aurora_point" => Some("aurora_point"),
        "space_weather_alert" | "space-weather-alert" => Some("space_weather_alert"),
        "military" | "military_base" | "military-base" => Some("military_base"),
        "nuclear" | "nuclear_site" | "nuclear-site" => Some("nuclear_site"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{build_label, normalize_table_name, record_matches};
    use serde_json::json;

    #[test]
    fn normalize_table_name_supports_aliases() {
        assert_eq!(normalize_table_name("fires"), Some("fire_hotspot"));
        assert_eq!(normalize_table_name("earthquakes"), Some("seismic_event"));
        assert_eq!(normalize_table_name("traffic"), Some("traffic_segment"));
    }

    #[test]
    fn build_label_prefers_name_then_title() {
        let value = json!({ "name": "Paris", "title": "fallback" });
        assert_eq!(build_label("zone", &value, "city-paris"), "Paris");
    }

    #[test]
    fn record_matches_checks_common_fields() {
        let value = json!({ "title": "Wildfire near Madrid" });
        assert!(record_matches(&value, "madrid"));
        assert!(!record_matches(&value, "tokyo"));
    }
}
