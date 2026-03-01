use std::collections::HashMap;

use anyhow::{Context, Result};
use tracing::trace;

use crate::types::{Road, RoadNode, RoadType};

pub fn parse_overpass_response(json: &serde_json::Value) -> Result<Vec<Road>> {
    let elements = json["elements"]
        .as_array()
        .context("missing 'elements' array in Overpass response")?;

    let nodes = build_node_map(elements);
    let roads = extract_ways(elements, &nodes);

    trace!(
        node_count = nodes.len(),
        road_count = roads.len(),
        "parsed Overpass elements"
    );

    Ok(roads)
}

fn build_node_map(elements: &[serde_json::Value]) -> HashMap<u64, (f64, f64)> {
    let mut map = HashMap::new();

    for elem in elements {
        if elem["type"].as_str() != Some("node") {
            continue;
        }
        let Some(id) = elem["id"].as_u64() else {
            continue;
        };
        let Some(lat) = elem["lat"].as_f64() else {
            continue;
        };
        let Some(lon) = elem["lon"].as_f64() else {
            continue;
        };
        map.insert(id, (lat, lon));
    }

    map
}

fn extract_ways(
    elements: &[serde_json::Value],
    nodes: &HashMap<u64, (f64, f64)>,
) -> Vec<Road> {
    let mut roads = Vec::new();

    for elem in elements {
        if elem["type"].as_str() != Some("way") {
            continue;
        }
        let Some(id) = elem["id"].as_u64() else {
            continue;
        };

        let tags = &elem["tags"];
        let highway = match tags["highway"].as_str() {
            Some(h) => h,
            None => continue,
        };

        let road_type = match parse_road_type(highway) {
            Some(rt) => rt,
            None => continue,
        };

        let name = tags["name"].as_str().map(String::from);
        let speed_limit_kmh = tags["maxspeed"]
            .as_str()
            .and_then(|s| s.trim_end_matches(" km/h").parse::<f64>().ok());

        let resolved_nodes: Vec<RoadNode> = elem["nodes"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|n| n.as_u64())
                    .filter_map(|nid| {
                        nodes.get(&nid).map(|&(lat, lon)| RoadNode { lat, lon })
                    })
                    .collect()
            })
            .unwrap_or_default();

        if resolved_nodes.is_empty() {
            continue;
        }

        roads.push(Road {
            id,
            road_type,
            name,
            nodes: resolved_nodes,
            speed_limit_kmh,
        });
    }

    roads
}

fn parse_road_type(highway: &str) -> Option<RoadType> {
    match highway {
        "motorway" | "motorway_link" => Some(RoadType::Motorway),
        "trunk" | "trunk_link" => Some(RoadType::Trunk),
        "primary" | "primary_link" => Some(RoadType::Primary),
        "secondary" | "secondary_link" => Some(RoadType::Secondary),
        "tertiary" | "tertiary_link" => Some(RoadType::Tertiary),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_road_types() {
        assert!(matches!(parse_road_type("motorway"), Some(RoadType::Motorway)));
        assert!(matches!(parse_road_type("trunk_link"), Some(RoadType::Trunk)));
        assert!(parse_road_type("residential").is_none());
    }
}
