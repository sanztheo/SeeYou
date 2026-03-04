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
    #[serde(default)]
    lat: Option<f64>,
    #[serde(default)]
    lon: Option<f64>,
    #[serde(default)]
    temp: Option<serde_json::Value>,
    #[serde(default)]
    dewp: Option<serde_json::Value>,
    #[serde(default)]
    wdir: Option<serde_json::Value>,
    #[serde(default)]
    wspd: Option<serde_json::Value>,
    #[serde(default)]
    wgst: Option<serde_json::Value>,
    #[serde(default)]
    visib: Option<serde_json::Value>,
    #[serde(default)]
    ceil: Option<serde_json::Value>,
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

fn parse_f64ish(val: &serde_json::Value) -> Option<f64> {
    match val {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn parse_u16ish(val: &serde_json::Value) -> Option<u16> {
    match val {
        serde_json::Value::Number(n) => n.as_u64().and_then(|v| u16::try_from(v).ok()),
        serde_json::Value::String(s) => s.trim().parse::<u16>().ok(),
        _ => None,
    }
}

fn parse_u32ish(val: &serde_json::Value) -> Option<u32> {
    match val {
        serde_json::Value::Number(n) => n.as_u64().and_then(|v| u32::try_from(v).ok()),
        serde_json::Value::String(s) => s.trim().parse::<u32>().ok(),
        _ => None,
    }
}

fn parse_fraction(text: &str) -> Option<f64> {
    let (num, den) = text.split_once('/')?;
    let num = num.trim().parse::<f64>().ok()?;
    let den = den.trim().parse::<f64>().ok()?;
    if den == 0.0 {
        return None;
    }
    Some(num / den)
}

fn parse_visibility_miles(text: &str) -> Option<f64> {
    let cleaned = text.trim().trim_end_matches('+');
    if cleaned.is_empty() {
        return None;
    }
    if let Ok(v) = cleaned.parse::<f64>() {
        return Some(v);
    }
    if cleaned.contains('/') {
        if let Some((whole, frac)) = cleaned.split_once(' ') {
            let whole = whole.trim().parse::<f64>().ok()?;
            return Some(whole + parse_fraction(frac)?);
        }
        return parse_fraction(cleaned);
    }
    None
}

fn parse_visibility(val: &serde_json::Value) -> Option<f64> {
    match val {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => parse_visibility_miles(s),
        _ => None,
    }
}

pub async fn fetch_metar_stations(client: &reqwest::Client) -> anyhow::Result<Vec<MetarStation>> {
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
        .filter_map(|m| {
            if m.icao_id.is_empty() {
                return None;
            }
            let lat = m.lat?;
            let lon = m.lon?;

            Some(MetarStation {
                station_id: m.icao_id,
                lat,
                lon,
                temp_c: m.temp.as_ref().and_then(parse_f64ish),
                dewpoint_c: m.dewp.as_ref().and_then(parse_f64ish),
                wind_dir_deg: m.wdir.as_ref().and_then(parse_wind_dir),
                wind_speed_kt: m.wspd.as_ref().and_then(parse_u16ish),
                wind_gust_kt: m.wgst.as_ref().and_then(parse_u16ish),
                visibility_m: m
                    .visib
                    .as_ref()
                    .and_then(parse_visibility)
                    .map(|v| v * STATUTE_MILES_TO_METERS),
                ceiling_ft: m.ceil.as_ref().and_then(parse_u32ish).map(|c| c * 100),
                flight_category: m.fltcat.unwrap_or_else(|| "UNK".to_string()),
                raw_metar: m.raw_ob.unwrap_or_default(),
            })
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
    fn parse_visibility_plus_suffix() {
        let val = serde_json::json!("6+");
        assert_eq!(parse_visibility(&val), Some(6.0));
    }

    #[test]
    fn parse_visibility_fraction() {
        let val = serde_json::json!("1 1/2");
        assert_eq!(parse_visibility(&val), Some(1.5));
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
        assert_eq!(m.temp.as_ref().and_then(parse_f64ish), Some(15.0));
        assert_eq!(m.dewp.as_ref().and_then(parse_f64ish), Some(10.0));
        assert_eq!(m.wspd.as_ref().and_then(parse_u16ish), Some(10));
        assert_eq!(m.wgst.as_ref().and_then(parse_u16ish), Some(20));
        assert_eq!(m.visib.as_ref().and_then(parse_visibility), Some(10.0));
        assert_eq!(m.ceil.as_ref().and_then(parse_u32ish), Some(50));
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
        assert_eq!(m.temp.as_ref().and_then(parse_f64ish), None);
        assert_eq!(m.dewp.as_ref().and_then(parse_f64ish), None);
        assert_eq!(m.wdir, None);
        assert_eq!(m.wspd.as_ref().and_then(parse_u16ish), None);
        assert_eq!(m.wgst.as_ref().and_then(parse_u16ish), None);
        assert_eq!(m.visib.as_ref().and_then(parse_visibility), None);
        assert_eq!(m.ceil.as_ref().and_then(parse_u32ish), None);
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
                lat: m.lat.unwrap_or_default(),
                lon: m.lon.unwrap_or_default(),
                temp_c: m.temp.as_ref().and_then(parse_f64ish),
                dewpoint_c: m.dewp.as_ref().and_then(parse_f64ish),
                wind_dir_deg: m.wdir.as_ref().and_then(parse_wind_dir),
                wind_speed_kt: m.wspd.as_ref().and_then(parse_u16ish),
                wind_gust_kt: m.wgst.as_ref().and_then(parse_u16ish),
                visibility_m: m
                    .visib
                    .as_ref()
                    .and_then(parse_visibility)
                    .map(|v| v * STATUTE_MILES_TO_METERS),
                ceiling_ft: m.ceil.as_ref().and_then(parse_u32ish).map(|c| c * 100),
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

    #[test]
    fn missing_lat_lon_filtered_out() {
        let json = r#"[
            {"icaoId": "KNO1", "lat": null, "lon": -73.0},
            {"icaoId": "KNO2", "lat": 40.0, "lon": null},
            {"icaoId": "KOK", "lat": 40.0, "lon": -73.0}
        ]"#;
        let parsed: Vec<ApiMetar> = serde_json::from_str(json).unwrap();
        let stations: Vec<MetarStation> = parsed
            .into_iter()
            .filter_map(|m| {
                if m.icao_id.is_empty() {
                    return None;
                }
                Some(MetarStation {
                    station_id: m.icao_id,
                    lat: m.lat?,
                    lon: m.lon?,
                    temp_c: m.temp.as_ref().and_then(parse_f64ish),
                    dewpoint_c: m.dewp.as_ref().and_then(parse_f64ish),
                    wind_dir_deg: m.wdir.as_ref().and_then(parse_wind_dir),
                    wind_speed_kt: m.wspd.as_ref().and_then(parse_u16ish),
                    wind_gust_kt: m.wgst.as_ref().and_then(parse_u16ish),
                    visibility_m: m
                        .visib
                        .as_ref()
                        .and_then(parse_visibility)
                        .map(|v| v * STATUTE_MILES_TO_METERS),
                    ceiling_ft: m.ceil.as_ref().and_then(parse_u32ish).map(|c| c * 100),
                    flight_category: m.fltcat.unwrap_or_else(|| "UNK".to_string()),
                    raw_metar: m.raw_ob.unwrap_or_default(),
                })
            })
            .collect();
        assert_eq!(stations.len(), 1);
        assert_eq!(stations[0].station_id, "KOK");
    }
}
