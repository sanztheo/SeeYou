use serde_json::Value;

/// Admission gate protecting the O(n×m) aircraft↔camera correlation
/// (`link_aircraft_to_nearby_cameras`, ~11 020 cameras checked per admitted
/// aircraft) from receiving the full aircraft volume once P0-1 fixes the
/// ADS-B ingest (~805 -> up to 30 000 aircraft/tick). `GRAPH_AIRCRAFT_FILTER`
/// selects the mode; unset or unrecognized falls back to the default.
const AIRCRAFT_FILTER_ENV: &str = "GRAPH_AIRCRAFT_FILTER";
const FILTER_MODE_DISABLED: &str = "none";
const MILITARY_BELOW_3000M_ALTITUDE_M: f64 = 3000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AircraftFilterMode {
    /// Default: only military aircraft below 3000m reach the graph.
    MilitaryBelow3000m,
    /// Escape hatch (`GRAPH_AIRCRAFT_FILTER=none`) — admits everything.
    Disabled,
}

fn parse_filter_mode(raw: Option<&str>) -> AircraftFilterMode {
    match raw.map(str::trim) {
        Some(FILTER_MODE_DISABLED) => AircraftFilterMode::Disabled,
        _ => AircraftFilterMode::MilitaryBelow3000m,
    }
}

fn admits(mode: AircraftFilterMode, payload: &Value) -> bool {
    match mode {
        AircraftFilterMode::Disabled => true,
        AircraftFilterMode::MilitaryBelow3000m => {
            let is_military = payload
                .get("is_military")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let altitude_m = payload
                .get("altitude_m")
                .and_then(Value::as_f64)
                .unwrap_or(f64::INFINITY);
            is_military && altitude_m < MILITARY_BELOW_3000M_ALTITUDE_M
        }
    }
}

/// Whether this aircraft payload (from the bus, `services::aircraft::Aircraft`
/// serialized as-is — fields `is_military: bool`, `altitude_m: f64`) is
/// admitted into the graph pipeline under the current `GRAPH_AIRCRAFT_FILTER`.
pub(crate) fn is_aircraft_admitted(payload: &Value) -> bool {
    let mode = parse_filter_mode(std::env::var(AIRCRAFT_FILTER_ENV).ok().as_deref());
    admits(mode, payload)
}

#[cfg(test)]
mod tests {
    use super::{admits, parse_filter_mode, AircraftFilterMode};
    use serde_json::json;

    #[test]
    fn default_mode_admits_military_below_3000m() {
        let mode = parse_filter_mode(None);
        assert_eq!(mode, AircraftFilterMode::MilitaryBelow3000m);
        let payload = json!({ "is_military": true, "altitude_m": 1500.0 });
        assert!(admits(mode, &payload));
    }

    #[test]
    fn default_mode_rejects_military_at_or_above_3000m() {
        let mode = AircraftFilterMode::MilitaryBelow3000m;
        let payload = json!({ "is_military": true, "altitude_m": 3000.0 });
        assert!(!admits(mode, &payload));
    }

    #[test]
    fn default_mode_rejects_civilian_regardless_of_altitude() {
        let mode = AircraftFilterMode::MilitaryBelow3000m;
        let payload = json!({ "is_military": false, "altitude_m": 100.0 });
        assert!(!admits(mode, &payload));
    }

    #[test]
    fn default_mode_rejects_missing_altitude() {
        let mode = AircraftFilterMode::MilitaryBelow3000m;
        let payload = json!({ "is_military": true });
        assert!(!admits(mode, &payload));
    }

    #[test]
    fn unrecognized_env_value_falls_back_to_default() {
        assert_eq!(
            parse_filter_mode(Some("bogus")),
            AircraftFilterMode::MilitaryBelow3000m
        );
    }

    #[test]
    fn disabled_mode_admits_everything() {
        let mode = parse_filter_mode(Some("none"));
        assert_eq!(mode, AircraftFilterMode::Disabled);
        let payload = json!({ "is_military": false, "altitude_m": 12000.0 });
        assert!(admits(mode, &payload));
    }
}
