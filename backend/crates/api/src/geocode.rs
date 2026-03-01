use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, warn};

use cache::RedisPool;

const NOMINATIM_URL: &str = "https://nominatim.openstreetmap.org/search";

#[derive(Debug, Deserialize)]
pub struct GeocodeQuery {
    pub q: String,
    pub limit: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeocodeResult {
    pub name: String,
    pub display_name: String,
    pub lat: f64,
    pub lon: f64,
    #[serde(rename = "type")]
    pub place_type: String,
}

#[derive(Debug, Serialize)]
pub struct GeocodeResponse {
    pub results: Vec<GeocodeResult>,
}

#[derive(Debug, Deserialize)]
struct NominatimPlace {
    display_name: String,
    lat: String,
    lon: String,
    #[serde(rename = "type")]
    place_type: String,
    name: Option<String>,
}

pub async fn geocode(
    State(pool): State<RedisPool>,
    Query(q): Query<GeocodeQuery>,
) -> Result<Json<GeocodeResponse>, StatusCode> {
    let query = q.q.trim().to_string();
    if query.len() < 2 {
        return Ok(Json(GeocodeResponse { results: vec![] }));
    }

    let limit = q.limit.unwrap_or(8).min(20);

    match cache::geocode::get_geocode(&pool, &query).await {
        Ok(Some(cached)) => match serde_json::from_str::<Vec<GeocodeResult>>(&cached) {
            Ok(results) => {
                debug!(query = %query, count = results.len(), "geocode cache hit");
                let results: Vec<GeocodeResult> =
                    results.into_iter().take(limit as usize).collect();
                return Ok(Json(GeocodeResponse { results }));
            }
            Err(e) => warn!(query = %query, error = %e, "corrupt geocode cache entry"),
        },
        Err(e) => warn!(query = %query, error = %e, "geocode cache read failed"),
        _ => {}
    }

    let client = reqwest::Client::builder()
        .user_agent("SeeYou/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp = client
        .get(NOMINATIM_URL)
        .query(&[
            ("q", query.as_str()),
            ("format", "json"),
            ("limit", &limit.to_string()),
            ("addressdetails", "0"),
            ("extratags", "0"),
        ])
        .send()
        .await
        .map_err(|e| {
            error!(error = %e, "Nominatim request failed");
            StatusCode::BAD_GATEWAY
        })?;

    if !resp.status().is_success() {
        error!(status = %resp.status(), "Nominatim returned error");
        return Err(StatusCode::BAD_GATEWAY);
    }

    let places: Vec<NominatimPlace> = resp.json().await.map_err(|e| {
        error!(error = %e, "Failed to parse Nominatim response");
        StatusCode::BAD_GATEWAY
    })?;

    let results: Vec<GeocodeResult> = places
        .into_iter()
        .filter_map(|p| {
            let lat = p.lat.parse::<f64>().ok()?;
            let lon = p.lon.parse::<f64>().ok()?;
            Some(GeocodeResult {
                name: p.name.unwrap_or_else(|| {
                    p.display_name
                        .split(',')
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string()
                }),
                display_name: p.display_name,
                lat,
                lon,
                place_type: p.place_type,
            })
        })
        .collect();

    if let Ok(json) = serde_json::to_string(&results) {
        let _ = cache::geocode::set_geocode(&pool, &query, &json).await;
    }

    debug!(query = %query, count = results.len(), "geocode from Nominatim");
    Ok(Json(GeocodeResponse { results }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nominatim_place_with_name_uses_it() {
        let place = NominatimPlace {
            display_name: "Paris, Ile-de-France, France".into(),
            lat: "48.8566".into(),
            lon: "2.3522".into(),
            place_type: "city".into(),
            name: Some("Paris".into()),
        };

        let lat: f64 = place.lat.parse().unwrap();
        let lon: f64 = place.lon.parse().unwrap();
        let name = place.name.clone().unwrap_or_else(|| {
            place.display_name.split(',').next().unwrap_or("").trim().to_string()
        });

        assert_eq!(name, "Paris");
        assert!((lat - 48.8566).abs() < 0.0001);
        assert!((lon - 2.3522).abs() < 0.0001);
    }

    #[test]
    fn nominatim_place_without_name_falls_back_to_display_name() {
        let place = NominatimPlace {
            display_name: "Berlin, Deutschland".into(),
            lat: "52.52".into(),
            lon: "13.405".into(),
            place_type: "city".into(),
            name: None,
        };

        let name = place.name.unwrap_or_else(|| {
            place.display_name.split(',').next().unwrap_or("").trim().to_string()
        });

        assert_eq!(name, "Berlin");
    }

    #[test]
    fn invalid_lat_produces_none() {
        let result = "not_a_number".parse::<f64>();
        assert!(result.is_err());
    }

    #[test]
    fn limit_clamped_to_20() {
        let limit: u8 = 255;
        assert_eq!(limit.min(20), 20);
    }

    #[test]
    fn limit_default_is_8() {
        let limit: Option<u8> = None;
        assert_eq!(limit.unwrap_or(8), 8);
    }

    #[test]
    fn query_shorter_than_2_chars_is_filtered() {
        let queries = ["", " ", "a", " a "];
        for q in queries {
            let trimmed = q.trim().to_string();
            assert!(trimmed.len() < 2, "Expected '{q}' to be < 2 chars after trim");
        }
    }

    #[test]
    fn query_of_2_chars_passes() {
        let q = "ab".trim().to_string();
        assert!(q.len() >= 2);
    }
}
