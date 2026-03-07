use anyhow::Context;
use cache::RedisPool;
use serde_json::Value;
use tracing::{info, warn};

const MILITARY_BASES_JSON: &str = include_str!("../../../data/military_bases.json");
const NUCLEAR_SITES_JSON: &str = include_str!("../../../data/nuclear_sites.json");

pub async fn hydrate_entity_on_demand(
    client: &graph::GraphClient,
    pool: &RedisPool,
    table: &str,
    id: &str,
) -> anyhow::Result<bool> {
    let Some(payload) = find_runtime_entity(pool, table, id).await? else {
        info!(
            entity_type = table,
            entity_id = id,
            "graph on-demand hydration skipped; entity missing from runtime sources"
        );
        return Ok(false);
    };

    let hydrator = consumer_graph::GraphBusConsumer::for_on_demand(client.clone())?;
    if let Err(error) = hydrator
        .hydrate_entity(table, &payload, "api.graph.on_demand")
        .await
    {
        warn!(
            entity_type = table,
            entity_id = id,
            error = ?error,
            "graph on-demand hydration failed"
        );
        return Err(error)
            .with_context(|| format!("failed to hydrate graph entity on demand for {table}:{id}"));
    }

    info!(
        entity_type = table,
        entity_id = id,
        "graph entity hydrated on demand"
    );
    Ok(true)
}

async fn find_runtime_entity(
    pool: &RedisPool,
    table: &str,
    id: &str,
) -> anyhow::Result<Option<Value>> {
    let entity = match table {
        "aircraft" => find_in_values(
            table,
            id,
            cache::aircraft::get_aircraft::<Value>(pool)
                .await?
                .unwrap_or_default(),
        ),
        "camera" => find_in_values(
            table,
            id,
            cache::cameras::get_cameras::<Value>(pool)
                .await?
                .unwrap_or_default(),
        ),
        "weather" => {
            let metar = cache::metar::get_metar::<Value>(pool)
                .await?
                .unwrap_or_default();
            let grid = cache::weather::get_weather::<Value>(pool).await?;
            find_in_values(table, id, metar).or_else(|| find_in_field(table, id, grid, "points"))
        }
        "satellite" => find_in_values(
            table,
            id,
            cache::satellites::get_satellites::<Value>(pool)
                .await?
                .unwrap_or_default(),
        ),
        "event" => find_in_field(
            table,
            id,
            cache::events::get_events::<Value>(pool).await?,
            "events",
        ),
        "cable" => find_in_field(
            table,
            id,
            cache::cables::get_cables::<Value>(pool).await?,
            "cables",
        ),
        "landing_point" => find_in_field(
            table,
            id,
            cache::cables::get_cables::<Value>(pool).await?,
            "landing_points",
        ),
        "seismic_event" => find_in_field(
            table,
            id,
            cache::seismic::get_seismic::<Value>(pool).await?,
            "earthquakes",
        ),
        "fire_hotspot" => find_in_field(
            table,
            id,
            cache::fires::get_fires::<Value>(pool).await?,
            "fires",
        ),
        "gdelt_event" => find_in_field(
            table,
            id,
            cache::gdelt::get_gdelt::<Value>(pool).await?,
            "events",
        ),
        "vessel" => find_in_field(
            table,
            id,
            cache::maritime::get_maritime::<Value>(pool).await?,
            "vessels",
        ),
        "cyber_threat" => find_in_field(
            table,
            id,
            cache::cyber::get_cyber::<Value>(pool).await?,
            "threats",
        ),
        "aurora_point" => find_in_field(
            table,
            id,
            cache::space_weather::get_space_weather::<Value>(pool).await?,
            "aurora",
        ),
        "space_weather_alert" => find_in_field(
            table,
            id,
            cache::space_weather::get_space_weather::<Value>(pool).await?,
            "alerts",
        ),
        "space_weather_event" => find_in_field(
            table,
            id,
            cache::space_weather::get_space_weather::<Value>(pool).await?,
            "alerts",
        ),
        "military_base" => find_in_embedded_array(table, id, MILITARY_BASES_JSON)?,
        "nuclear_site" => find_in_embedded_array(table, id, NUCLEAR_SITES_JSON)?,
        _ => None,
    };

    Ok(entity)
}

fn find_in_embedded_array(table: &str, id: &str, raw_json: &str) -> anyhow::Result<Option<Value>> {
    let values: Vec<Value> = serde_json::from_str(raw_json)
        .with_context(|| format!("failed to decode embedded runtime data for table={table}"))?;
    Ok(find_in_values(table, id, values))
}

fn find_in_field(table: &str, id: &str, payload: Option<Value>, field: &str) -> Option<Value> {
    let items = payload
        .and_then(|value| value.get(field).and_then(Value::as_array).cloned())
        .unwrap_or_default();
    find_in_values(table, id, items)
}

fn find_in_values(table: &str, id: &str, values: Vec<Value>) -> Option<Value> {
    values.into_iter().find_map(|mut value| {
        prepare_payload(table, &mut value);
        payload_matches_id(table, &value, id).then_some(value)
    })
}

fn prepare_payload(table: &str, payload: &mut Value) {
    if let Some(object) = payload.as_object_mut() {
        super::stable_ids::inject_stable_id(table, object);
    }
}

fn payload_matches_id(table: &str, payload: &Value, expected_id: &str) -> bool {
    super::stable_ids::resolve_or_create_id(table, payload) == expected_id
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{
        find_in_embedded_array, find_in_values, payload_matches_id, prepare_payload,
        MILITARY_BASES_JSON, NUCLEAR_SITES_JSON,
    };

    #[test]
    fn find_in_values_matches_aircraft_by_icao() {
        let record = find_in_values(
            "aircraft",
            "abc123",
            vec![json!({ "icao": "abc123", "callsign": "TEST01" })],
        )
        .expect("expected aircraft payload");

        assert_eq!(record.get("icao").and_then(Value::as_str), Some("abc123"));
    }

    #[test]
    fn prepare_payload_injects_stable_id_when_missing() {
        let mut payload = json!({ "title": "Outage", "lat": 48.0, "lon": 2.0 });
        prepare_payload("gdelt_event", &mut payload);

        let id = payload
            .get("id")
            .and_then(Value::as_str)
            .expect("expected injected stable id");
        assert!(id.starts_with("gdelt_event_"));
    }

    #[test]
    fn embedded_military_base_records_match_their_stable_ids() {
        let mut values: Vec<Value> =
            serde_json::from_str(MILITARY_BASES_JSON).expect("valid military bases json");
        let first = values
            .pop()
            .expect("expected at least one military base record");
        let expected_id = super::super::stable_ids::resolve_or_create_id("military_base", &first);

        let record = find_in_embedded_array("military_base", &expected_id, MILITARY_BASES_JSON)
            .expect("embedded lookup should parse")
            .expect("expected matching military base");

        assert!(payload_matches_id("military_base", &record, &expected_id));
    }

    #[test]
    fn embedded_nuclear_site_records_match_their_stable_ids() {
        let mut values: Vec<Value> =
            serde_json::from_str(NUCLEAR_SITES_JSON).expect("valid nuclear sites json");
        let first = values
            .pop()
            .expect("expected at least one nuclear site record");
        let expected_id = super::super::stable_ids::resolve_or_create_id("nuclear_site", &first);

        let record = find_in_embedded_array("nuclear_site", &expected_id, NUCLEAR_SITES_JSON)
            .expect("embedded lookup should parse")
            .expect("expected matching nuclear site");

        assert!(payload_matches_id("nuclear_site", &record, &expected_id));
    }
}
