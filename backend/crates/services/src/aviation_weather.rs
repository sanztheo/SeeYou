use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;
use ws::messages::MetarStation;

const METAR_URL: &str =
    "https://aviationweather.gov/api/data/metar?format=json&taf=false&hours=1&bbox=-180,-90,180,90";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

const STATUTE_MILES_TO_METERS: f64 = 1609.34;

#[derive(Deserialize)]
struct ApiMetar {
    #[serde(rename = "icaoId")]
    icao_id: String,
    lat: f64,
    lon: f64,
    #[serde(default)]
    temp: Option<f64>,
    #[serde(default)]
    dewp: Option<f64>,
    #[serde(default)]
    wdir: Option<serde_json::Value>,
    #[serde(default)]
    wspd: Option<u16>,
    #[serde(default)]
    wgst: Option<u16>,
    #[serde(default)]
    visib: Option<f64>,
    #[serde(default)]
    ceil: Option<u32>,
    #[serde(default)]
    fltcat: Option<String>,
    #[serde(default, rename = "rawOb")]
    raw_ob: Option<String>,
}

fn parse_wind_dir(val: &serde_json::Value) -> Option<u16> {
    match val {
        serde_json::Value::Number(n) => n.as_u64().map(|v| v as u16),
        serde_json::Value::String(s) => s.parse::<u16>().ok(),
        _ => None,
    }
}

pub async fn fetch_metar_stations(
    client: &reqwest::Client,
) -> anyhow::Result<Vec<MetarStation>> {
    let raw: Vec<ApiMetar> = client
        .get(METAR_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("METAR request failed")?
        .error_for_status()
        .context("aviationweather.gov returned error status")?
        .json()
        .await
        .context("failed to parse METAR response")?;

    let stations = raw
        .into_iter()
        .filter(|m| !m.icao_id.is_empty())
        .map(|m| MetarStation {
            station_id: m.icao_id,
            lat: m.lat,
            lon: m.lon,
            temp_c: m.temp,
            dewpoint_c: m.dewp,
            wind_dir_deg: m.wdir.as_ref().and_then(parse_wind_dir),
            wind_speed_kt: m.wspd,
            wind_gust_kt: m.wgst,
            visibility_m: m.visib.map(|v| v * STATUTE_MILES_TO_METERS),
            ceiling_ft: m.ceil.map(|c| c * 100),
            flight_category: m.fltcat.unwrap_or_else(|| "UNK".to_string()),
            raw_metar: m.raw_ob.unwrap_or_default(),
        })
        .collect();

    Ok(stations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statute_miles_to_meters_constant() {
        assert!((STATUTE_MILES_TO_METERS - 1609.34).abs() < 0.001);
    }

    #[test]
    fn visibility_conversion_10sm() {
        let miles = 10.0_f64;
        let meters = miles * STATUTE_MILES_TO_METERS;
        assert!((meters - 16093.4).abs() < 0.1);
    }

    #[test]
    fn visibility_conversion_fractional() {
        let miles = 0.5_f64;
        let meters = miles * STATUTE_MILES_TO_METERS;
        assert!((meters - 804.67).abs() < 0.1);
    }

    #[test]
    fn ceiling_hundreds_to_feet() {
        let hundreds: u32 = 50;
        assert_eq!(hundreds * 100, 5000);
    }

    #[test]
    fn ceiling_low_overcast() {
        let hundreds: u32 = 3;
        assert_eq!(hundreds * 100, 300);
    }

    #[test]
    fn parse_wind_dir_number() {
        let val = serde_json::json!(270);
        assert_eq!(parse_wind_dir(&val), Some(270));
    }

    #[test]
    fn parse_wind_dir_string_numeric() {
        let val = serde_json::json!("180");
        assert_eq!(parse_wind_dir(&val), Some(180));
    }

    #[test]
    fn parse_wind_dir_vrb() {
        let val = serde_json::json!("VRB");
        assert_eq!(parse_wind_dir(&val), None);
    }

    #[test]
    fn parse_wind_dir_null() {
        let val = serde_json::Value::Null;
        assert_eq!(parse_wind_dir(&val), None);
    }

    #[test]
    fn api_response_full_fields() {
        let json = r#"[{
            "icaoId": "KJFK",
            "lat": 40.6413,
            "lon": -73.7781,
            "temp": 15.0,
            "dewp": 10.0,
            "wdir": 270,
            "wspd": 10,
            "wgst": 20,
            "visib": 10.0,
            "ceil": 50,
            "fltcat": "VFR",
            "rawOb": "KJFK 012356Z 27010G20KT 10SM FEW050 15/10 A3010"
        }]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.len(), 1);
        let m = &parsed[0];
        assert_eq!(m.icao_id, "KJFK");
        assert_eq!(m.temp, Some(15.0));
        assert_eq!(m.dewp, Some(10.0));
        assert_eq!(m.wspd, Some(10));
        assert_eq!(m.wgst, Some(20));
        assert!((m.visib.unwrap() - 10.0).abs() < 0.01);
        assert_eq!(m.ceil, Some(50));
        assert_eq!(m.fltcat.as_deref(), Some("VFR"));
    }

    #[test]
    fn api_response_vrb_wind() {
        let json = r#"[{
            "icaoId": "KORD",
            "lat": 41.97,
            "lon": -87.90,
            "wdir": "VRB",
            "wspd": 3,
            "fltcat": "VFR",
            "rawOb": "KORD 012356Z VRB03KT 10SM CLR 20/15 A2990"
        }]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        let m = &parsed[0];
        let dir = m.wdir.as_ref().and_then(parse_wind_dir);
        assert_eq!(dir, None);
    }

    #[test]
    fn api_response_missing_optional_fields() {
        let json = r#"[{
            "icaoId": "KXYZ",
            "lat": 35.0,
            "lon": -80.0,
            "fltcat": "IFR",
            "rawOb": "KXYZ 012356Z AUTO"
        }]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        let m = &parsed[0];
        assert_eq!(m.icao_id, "KXYZ");
        assert_eq!(m.temp, None);
        assert_eq!(m.dewp, None);
        assert_eq!(m.wdir, None);
        assert_eq!(m.wspd, None);
        assert_eq!(m.wgst, None);
        assert_eq!(m.visib, None);
        assert_eq!(m.ceil, None);
    }

    #[test]
    fn api_response_completely_bare() {
        let json = r#"[{"icaoId": "ZZZZ", "lat": 0.0, "lon": 0.0}]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        let m = &parsed[0];
        assert_eq!(m.fltcat, None);
        assert_eq!(m.raw_ob, None);
    }

    #[test]
    fn empty_icao_filtered_out() {
        let json = r#"[
            {"icaoId": "", "lat": 0.0, "lon": 0.0},
            {"icaoId": "KJFK", "lat": 40.6, "lon": -73.7}
        ]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        let stations: Vec<MetarStation> = parsed
            .into_iter()
            .filter(|m| !m.icao_id.is_empty())
            .map(|m| MetarStation {
                station_id: m.icao_id,
                lat: m.lat,
                lon: m.lon,
                temp_c: m.temp,
                dewpoint_c: m.dewp,
                wind_dir_deg: m.wdir.as_ref().and_then(parse_wind_dir),
                wind_speed_kt: m.wspd,
                wind_gust_kt: m.wgst,
                visibility_m: m.visib.map(|v| v * STATUTE_MILES_TO_METERS),
                ceiling_ft: m.ceil.map(|c| c * 100),
                flight_category: m.fltcat.unwrap_or_else(|| "UNK".to_string()),
                raw_metar: m.raw_ob.unwrap_or_default(),
            })
            .collect();
        assert_eq!(stations.len(), 1);
        assert_eq!(stations[0].station_id, "KJFK");
    }

    #[test]
    fn fltcat_defaults_to_unk() {
        let json = r#"[{"icaoId": "KABC", "lat": 30.0, "lon": -90.0}]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        let m = &parsed[0];
        let category = m.fltcat.clone().unwrap_or_else(|| "UNK".to_string());
        assert_eq!(category, "UNK");
    }
}
