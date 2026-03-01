use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::WeatherPoint;

const API_URL: &str = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

const CURRENT_PARAMS: &str =
    "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,\
     wind_speed_10m,wind_direction_10m";

/// ~40 points spread across the globe: (lat, lon).
static GRID: &[(f64, f64)] = &[
    // Europe
    (51.51, -0.13),   // London
    (48.86, 2.35),    // Paris
    (52.52, 13.41),   // Berlin
    (40.42, -3.70),   // Madrid
    (41.90, 12.50),   // Rome
    (59.33, 18.07),   // Stockholm
    (55.76, 37.62),   // Moscow
    (41.01, 28.98),   // Istanbul
    // North America
    (40.71, -74.01),  // New York
    (34.05, -118.24), // Los Angeles
    (41.88, -87.63),  // Chicago
    (43.65, -79.38),  // Toronto
    (19.43, -99.13),  // Mexico City
    (25.76, -80.19),  // Miami
    (47.61, -122.33), // Seattle
    (39.74, -104.99), // Denver
    // Asia
    (35.68, 139.69),  // Tokyo
    (39.91, 116.39),  // Beijing
    (31.23, 121.47),  // Shanghai
    (19.08, 72.88),   // Mumbai
    (13.76, 100.50),  // Bangkok
    (1.35, 103.82),   // Singapore
    (37.57, 126.98),  // Seoul
    (22.32, 114.17),  // Hong Kong
    // Middle East
    (25.20, 55.27),   // Dubai
    (24.71, 46.67),   // Riyadh
    (35.69, 51.39),   // Tehran
    (30.04, 31.24),   // Cairo
    // Africa
    (6.52, 3.38),     // Lagos
    (-1.29, 36.82),   // Nairobi
    (-26.20, 28.05),  // Johannesburg
    (33.57, -7.59),   // Casablanca
    // South America
    (-23.55, -46.63), // São Paulo
    (-34.60, -58.38), // Buenos Aires
    (4.71, -74.07),   // Bogotá
    (-12.05, -77.04), // Lima
    // Oceania
    (-33.87, 151.21), // Sydney
    (-36.85, 174.76), // Auckland
    (-37.81, 144.96), // Melbourne
    (-31.95, 115.86), // Perth
];

#[derive(Debug, Deserialize)]
struct OpenMeteoItem {
    latitude: f64,
    longitude: f64,
    current: Option<CurrentWeather>,
}

#[derive(Debug, Deserialize)]
struct CurrentWeather {
    #[serde(default)]
    temperature_2m: f64,
    #[serde(default)]
    relative_humidity_2m: f64,
    #[serde(default)]
    precipitation: f64,
    #[serde(default)]
    cloud_cover: f64,
    #[serde(default)]
    pressure_msl: f64,
    #[serde(default)]
    wind_speed_10m: f64,
    #[serde(default)]
    wind_direction_10m: f64,
}

pub async fn fetch_weather_grid(
    client: &reqwest::Client,
) -> anyhow::Result<Vec<WeatherPoint>> {
    let lats: String = GRID.iter().map(|(lat, _)| lat.to_string()).collect::<Vec<_>>().join(",");
    let lons: String = GRID.iter().map(|(_, lon)| lon.to_string()).collect::<Vec<_>>().join(",");

    let url = format!(
        "{API_URL}?latitude={lats}&longitude={lons}&current={CURRENT_PARAMS}"
    );

    let items: Vec<OpenMeteoItem> = client
        .get(&url)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("open-meteo request failed")?
        .error_for_status()
        .context("open-meteo returned an error status")?
        .json()
        .await
        .context("failed to parse open-meteo response")?;

    let points = items
        .into_iter()
        .filter_map(|item| {
            let current = item.current?;
            Some(WeatherPoint {
                lat: item.latitude,
                lon: item.longitude,
                temperature_c: current.temperature_2m,
                wind_speed_ms: current.wind_speed_10m / 3.6,
                wind_direction_deg: current.wind_direction_10m,
                pressure_hpa: current.pressure_msl,
                cloud_cover_pct: current.cloud_cover,
                precipitation_mm: current.precipitation,
                humidity_pct: current.relative_humidity_2m,
            })
        })
        .collect();

    Ok(points)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_points_are_valid_coordinates() {
        for &(lat, lon) in GRID.iter() {
            assert!((-90.0..=90.0).contains(&lat), "invalid lat: {lat}");
            assert!((-180.0..=180.0).contains(&lon), "invalid lon: {lon}");
        }
    }

    #[test]
    fn grid_has_sufficient_coverage() {
        assert!(GRID.len() >= 30, "grid should have at least 30 points, got {}", GRID.len());
    }

    #[test]
    fn grid_covers_all_hemispheres() {
        let has_north = GRID.iter().any(|&(lat, _)| lat > 20.0);
        let has_south = GRID.iter().any(|&(lat, _)| lat < -20.0);
        let has_east = GRID.iter().any(|&(_, lon)| lon > 20.0);
        let has_west = GRID.iter().any(|&(_, lon)| lon < -20.0);
        assert!(has_north, "missing northern hemisphere coverage");
        assert!(has_south, "missing southern hemisphere coverage");
        assert!(has_east, "missing eastern hemisphere coverage");
        assert!(has_west, "missing western hemisphere coverage");
    }

    #[test]
    fn grid_has_no_duplicates() {
        for (i, a) in GRID.iter().enumerate() {
            for (j, b) in GRID.iter().enumerate() {
                if i != j {
                    assert!(
                        (a.0 - b.0).abs() > f64::EPSILON || (a.1 - b.1).abs() > f64::EPSILON,
                        "duplicate grid point at indices {i} and {j}: ({}, {})",
                        a.0,
                        a.1
                    );
                }
            }
        }
    }

    #[test]
    fn kmh_to_ms_conversion() {
        let kmh = 36.0_f64;
        let ms = kmh / 3.6;
        assert!((ms - 10.0).abs() < 0.01);

        let kmh_zero = 0.0_f64;
        assert!((kmh_zero / 3.6).abs() < f64::EPSILON);

        let kmh_100 = 100.0_f64;
        assert!((kmh_100 / 3.6 - 27.778).abs() < 0.01);
    }

    #[test]
    fn open_meteo_item_deserialization() {
        let json = r#"{
            "latitude": 48.85,
            "longitude": 2.35,
            "current": {
                "temperature_2m": 20.0,
                "relative_humidity_2m": 65.0,
                "precipitation": 0.0,
                "cloud_cover": 50.0,
                "pressure_msl": 1013.0,
                "wind_speed_10m": 18.0,
                "wind_direction_10m": 225.0
            }
        }"#;
        let item: OpenMeteoItem = serde_json::from_str(json).unwrap();
        assert!((item.latitude - 48.85).abs() < f64::EPSILON);
        assert!((item.longitude - 2.35).abs() < f64::EPSILON);

        let current = item.current.expect("current should be present");
        assert!((current.temperature_2m - 20.0).abs() < f64::EPSILON);
        assert!((current.wind_speed_10m - 18.0).abs() < f64::EPSILON);
        assert!((current.wind_direction_10m - 225.0).abs() < f64::EPSILON);
    }

    #[test]
    fn open_meteo_item_without_current() {
        let json = r#"{"latitude": 48.85, "longitude": 2.35}"#;
        let item: OpenMeteoItem = serde_json::from_str(json).unwrap();
        assert!(item.current.is_none());
    }

    #[test]
    fn current_weather_defaults_missing_fields() {
        let json = r#"{"temperature_2m": 20.0}"#;
        let current: CurrentWeather = serde_json::from_str(json).unwrap();
        assert!((current.temperature_2m - 20.0).abs() < f64::EPSILON);
        assert!((current.relative_humidity_2m - 0.0).abs() < f64::EPSILON);
        assert!((current.precipitation - 0.0).abs() < f64::EPSILON);
        assert!((current.cloud_cover - 0.0).abs() < f64::EPSILON);
        assert!((current.pressure_msl - 0.0).abs() < f64::EPSILON);
        assert!((current.wind_speed_10m - 0.0).abs() < f64::EPSILON);
        assert!((current.wind_direction_10m - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn wind_conversion_in_weather_point_mapping() {
        let item = OpenMeteoItem {
            latitude: 51.51,
            longitude: -0.13,
            current: Some(CurrentWeather {
                temperature_2m: 15.0,
                relative_humidity_2m: 70.0,
                precipitation: 0.5,
                cloud_cover: 80.0,
                pressure_msl: 1010.0,
                wind_speed_10m: 36.0,
                wind_direction_10m: 180.0,
            }),
        };

        let current = item.current.unwrap();
        let point = WeatherPoint {
            lat: item.latitude,
            lon: item.longitude,
            temperature_c: current.temperature_2m,
            wind_speed_ms: current.wind_speed_10m / 3.6,
            wind_direction_deg: current.wind_direction_10m,
            pressure_hpa: current.pressure_msl,
            cloud_cover_pct: current.cloud_cover,
            precipitation_mm: current.precipitation,
            humidity_pct: current.relative_humidity_2m,
        };

        assert!((point.wind_speed_ms - 10.0).abs() < 0.01);
        assert!((point.temperature_c - 15.0).abs() < f64::EPSILON);
        assert!((point.humidity_pct - 70.0).abs() < f64::EPSILON);
    }
}
