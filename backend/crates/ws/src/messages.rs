use prediction::PredictedTrajectory;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AircraftPosition {
    pub icao: String,
    pub callsign: Option<String>,
    pub aircraft_type: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub altitude_m: f64,
    pub speed_ms: f64,
    pub heading: f64,
    pub vertical_rate_ms: f64,
    pub on_ground: bool,
    pub is_military: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SatellitePosition {
    pub norad_id: u64,
    pub name: String,
    pub category: String,
    pub lat: f64,
    pub lon: f64,
    pub altitude_km: f64,
    pub velocity_km_s: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetarStation {
    pub station_id: String,
    pub lat: f64,
    pub lon: f64,
    pub temp_c: Option<f64>,
    pub dewpoint_c: Option<f64>,
    pub wind_dir_deg: Option<u16>,
    pub wind_speed_kt: Option<u16>,
    pub wind_gust_kt: Option<u16>,
    pub visibility_m: Option<f64>,
    pub ceiling_ft: Option<u32>,
    pub flight_category: String,
    pub raw_metar: String,
}

/// Wire format for all WebSocket messages.
/// The `tag` / `content` serde representation keeps the JSON shape
/// consistent: `{ "type": "Ping" }` or `{ "type": "Connected", "payload": { "client_id": "..." } }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsMessage {
    Connected { client_id: String },
    Ping,
    Pong,
    Error { message: String },
    AircraftUpdate { aircraft: Vec<AircraftPosition> },
    /// Chunked aircraft delivery — avoids multi-MB single frames.
    AircraftBatch {
        aircraft: Vec<AircraftPosition>,
        chunk_index: u32,
        total_chunks: u32,
    },
    /// IMM-EKF predicted trajectories for military aircraft.
    Predictions {
        trajectories: Vec<PredictedTrajectory>,
    },
    /// Chunked satellite delivery.
    SatelliteBatch {
        satellites: Vec<SatellitePosition>,
        chunk_index: u32,
        total_chunks: u32,
    },
    /// METAR weather observations from aviationweather.gov.
    MetarUpdate {
        stations: Vec<MetarStation>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_metar() -> MetarStation {
        MetarStation {
            station_id: "KJFK".to_string(),
            lat: 40.64,
            lon: -73.78,
            temp_c: Some(15.0),
            dewpoint_c: Some(10.0),
            wind_dir_deg: Some(270),
            wind_speed_kt: Some(10),
            wind_gust_kt: None,
            visibility_m: Some(16093.4),
            ceiling_ft: Some(5000),
            flight_category: "VFR".to_string(),
            raw_metar: "KJFK 012356Z 27010KT 10SM FEW050 15/10 A3010".to_string(),
        }
    }

    #[test]
    fn metar_station_serialization_roundtrip() {
        let station = sample_metar();
        let json = serde_json::to_string(&station).unwrap();
        let decoded: MetarStation = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.station_id, "KJFK");
        assert_eq!(decoded.flight_category, "VFR");
        assert_eq!(decoded.wind_dir_deg, Some(270));
        assert_eq!(decoded.wind_gust_kt, None);
        assert!((decoded.lat - 40.64).abs() < 0.001);
    }

    #[test]
    fn metar_station_optional_fields_serialize_as_null() {
        let station = MetarStation {
            station_id: "KXYZ".to_string(),
            lat: 0.0,
            lon: 0.0,
            temp_c: None,
            dewpoint_c: None,
            wind_dir_deg: None,
            wind_speed_kt: None,
            wind_gust_kt: None,
            visibility_m: None,
            ceiling_ft: None,
            flight_category: "UNK".to_string(),
            raw_metar: String::new(),
        };
        let val: serde_json::Value = serde_json::to_value(&station).unwrap();
        assert!(val["temp_c"].is_null());
        assert!(val["ceiling_ft"].is_null());
    }

    #[test]
    fn ws_message_metar_update_roundtrip() {
        let msg = WsMessage::MetarUpdate {
            stations: vec![sample_metar()],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: WsMessage = serde_json::from_str(&json).unwrap();
        match decoded {
            WsMessage::MetarUpdate { stations } => {
                assert_eq!(stations.len(), 1);
                assert_eq!(stations[0].station_id, "KJFK");
            }
            _ => panic!("expected MetarUpdate"),
        }
    }

    #[test]
    fn ws_message_metar_tag_format() {
        let msg = WsMessage::MetarUpdate { stations: vec![] };
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "MetarUpdate");
        assert!(val["payload"]["stations"].is_array());
    }

    #[test]
    fn ws_message_connected_tag_format() {
        let msg = WsMessage::Connected {
            client_id: "abc-123".to_string(),
        };
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "Connected");
        assert_eq!(val["payload"]["client_id"], "abc-123");
    }

    #[test]
    fn ws_message_ping_pong_tags() {
        let ping_json = serde_json::to_string(&WsMessage::Ping).unwrap();
        assert!(ping_json.contains("\"type\":\"Ping\""));

        let pong_json = serde_json::to_string(&WsMessage::Pong).unwrap();
        assert!(pong_json.contains("\"type\":\"Pong\""));
    }

    #[test]
    fn ws_message_ping_roundtrip() {
        let json = serde_json::to_string(&WsMessage::Ping).unwrap();
        let decoded: WsMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(decoded, WsMessage::Ping));
    }

    #[test]
    fn ws_message_error_roundtrip() {
        let msg = WsMessage::Error {
            message: "something broke".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: WsMessage = serde_json::from_str(&json).unwrap();
        match decoded {
            WsMessage::Error { message } => assert_eq!(message, "something broke"),
            _ => panic!("expected Error"),
        }
    }

    #[test]
    fn ws_message_aircraft_batch_tag_format() {
        let msg = WsMessage::AircraftBatch {
            aircraft: vec![],
            chunk_index: 0,
            total_chunks: 3,
        };
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "AircraftBatch");
        assert_eq!(val["payload"]["chunk_index"], 0);
        assert_eq!(val["payload"]["total_chunks"], 3);
    }

    #[test]
    fn ws_message_satellite_batch_tag_format() {
        let msg = WsMessage::SatelliteBatch {
            satellites: vec![],
            chunk_index: 1,
            total_chunks: 5,
        };
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "SatelliteBatch");
        assert_eq!(val["payload"]["chunk_index"], 1);
        assert_eq!(val["payload"]["total_chunks"], 5);
    }

    #[test]
    fn aircraft_position_roundtrip() {
        let pos = AircraftPosition {
            icao: "A1B2C3".to_string(),
            callsign: Some("UAL123".to_string()),
            aircraft_type: Some("B738".to_string()),
            lat: 40.0,
            lon: -74.0,
            altitude_m: 10000.0,
            speed_ms: 250.0,
            heading: 90.0,
            vertical_rate_ms: 0.0,
            on_ground: false,
            is_military: false,
        };
        let json = serde_json::to_string(&pos).unwrap();
        let decoded: AircraftPosition = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.icao, "A1B2C3");
        assert_eq!(decoded.callsign.as_deref(), Some("UAL123"));
        assert!(!decoded.on_ground);
    }

    #[test]
    fn satellite_position_roundtrip() {
        let sat = SatellitePosition {
            norad_id: 25544,
            name: "ISS".to_string(),
            category: "space-station".to_string(),
            lat: 51.6,
            lon: -0.1,
            altitude_km: 420.0,
            velocity_km_s: 7.66,
        };
        let json = serde_json::to_string(&sat).unwrap();
        let decoded: SatellitePosition = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.norad_id, 25544);
        assert_eq!(decoded.name, "ISS");
    }
}
