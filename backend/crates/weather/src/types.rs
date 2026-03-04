use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherPoint {
    pub lat: f64,
    pub lon: f64,
    pub temperature_c: f64,
    pub wind_speed_ms: f64,
    pub wind_direction_deg: f64,
    pub pressure_hpa: f64,
    pub cloud_cover_pct: f64,
    pub precipitation_mm: f64,
    pub humidity_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherGrid {
    pub points: Vec<WeatherPoint>,
    pub fetched_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_point() -> WeatherPoint {
        WeatherPoint {
            lat: 48.85,
            lon: 2.35,
            temperature_c: 22.5,
            wind_speed_ms: 5.0,
            wind_direction_deg: 180.0,
            pressure_hpa: 1013.25,
            cloud_cover_pct: 45.0,
            precipitation_mm: 0.0,
            humidity_pct: 65.0,
        }
    }

    #[test]
    fn weather_point_serialization_roundtrip() {
        let point = sample_point();
        let json = serde_json::to_string(&point).unwrap();
        let decoded: WeatherPoint = serde_json::from_str(&json).unwrap();
        assert!((decoded.lat - 48.85).abs() < f64::EPSILON);
        assert!((decoded.lon - 2.35).abs() < f64::EPSILON);
        assert!((decoded.temperature_c - 22.5).abs() < f64::EPSILON);
        assert!((decoded.wind_speed_ms - 5.0).abs() < f64::EPSILON);
        assert!((decoded.wind_direction_deg - 180.0).abs() < f64::EPSILON);
        assert!((decoded.pressure_hpa - 1013.25).abs() < f64::EPSILON);
        assert!((decoded.cloud_cover_pct - 45.0).abs() < f64::EPSILON);
        assert!((decoded.precipitation_mm - 0.0).abs() < f64::EPSILON);
        assert!((decoded.humidity_pct - 65.0).abs() < f64::EPSILON);
    }

    #[test]
    fn weather_grid_serialization() {
        let grid = WeatherGrid {
            points: vec![sample_point()],
            fetched_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&grid).unwrap();
        assert!(json.contains("fetched_at"));
        assert!(json.contains("points"));
        assert!(json.contains("2026-01-01T00:00:00Z"));

        let decoded: WeatherGrid = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.points.len(), 1);
        assert_eq!(decoded.fetched_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn weather_grid_empty_points() {
        let grid = WeatherGrid {
            points: vec![],
            fetched_at: "2026-03-01T12:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&grid).unwrap();
        let decoded: WeatherGrid = serde_json::from_str(&json).unwrap();
        assert!(decoded.points.is_empty());
    }

    #[test]
    fn weather_point_deserialization_from_json() {
        let json = r#"{
            "lat": 40.0,
            "lon": -74.0,
            "temperature_c": 15.0,
            "wind_speed_ms": 3.5,
            "wind_direction_deg": 270.0,
            "pressure_hpa": 1015.0,
            "cloud_cover_pct": 80.0,
            "precipitation_mm": 1.2,
            "humidity_pct": 90.0
        }"#;
        let point: WeatherPoint = serde_json::from_str(json).unwrap();
        assert!((point.lat - 40.0).abs() < f64::EPSILON);
        assert!((point.lon - (-74.0)).abs() < f64::EPSILON);
        assert!((point.wind_speed_ms - 3.5).abs() < f64::EPSILON);
        assert!((point.precipitation_mm - 1.2).abs() < f64::EPSILON);
        assert!((point.humidity_pct - 90.0).abs() < f64::EPSILON);
    }

    #[test]
    fn weather_point_missing_field_errors() {
        let json = r#"{"lat":40.0,"lon":-74.0}"#;
        let result = serde_json::from_str::<WeatherPoint>(json);
        assert!(
            result.is_err(),
            "missing fields should cause deserialization error"
        );
    }

    #[test]
    fn weather_point_extreme_values() {
        let point = WeatherPoint {
            lat: -90.0,
            lon: 180.0,
            temperature_c: -89.2,
            wind_speed_ms: 113.0,
            wind_direction_deg: 359.9,
            pressure_hpa: 870.0,
            cloud_cover_pct: 100.0,
            precipitation_mm: 300.0,
            humidity_pct: 100.0,
        };
        let json = serde_json::to_string(&point).unwrap();
        let decoded: WeatherPoint = serde_json::from_str(&json).unwrap();
        assert!((decoded.temperature_c - (-89.2)).abs() < f64::EPSILON);
        assert!((decoded.wind_speed_ms - 113.0).abs() < f64::EPSILON);
    }
}
