use serde_json::Value;
use std::collections::HashSet;

pub(crate) fn extract_lat_lon(payload: &Value) -> Option<(f64, f64)> {
    let direct = [
        ("lat", "lon"),
        ("latitude", "longitude"),
        ("y", "x"),
        ("src_lat", "src_lon"),
    ];

    for (lat_key, lon_key) in direct {
        let (Some(lat_raw), Some(lon_raw)) = (payload.get(lat_key), payload.get(lon_key)) else {
            continue;
        };

        if let (Some(lat), Some(lon)) = (number_from_value(lat_raw), number_from_value(lon_raw)) {
            if valid_lat_lon(lat, lon) {
                return Some((lat, lon));
            }
        }
    }

    if let Some(coordinates) = payload.get("coordinates").and_then(Value::as_array) {
        if let Some(found) = lat_lon_from_coordinate_array(coordinates) {
            return Some(found);
        }

        if let Some(first) = coordinates.first().and_then(Value::as_array) {
            if let Some(found) = lat_lon_from_coordinate_array(first) {
                return Some(found);
            }
        }
    }

    if let Some(location) = payload.get("location") {
        if let Some(found) = extract_lat_lon_from_location(location) {
            return Some(found);
        }
    }

    if let Some(geometry) = payload.get("geometry") {
        if let Some(found) = extract_lat_lon_from_geometry(geometry) {
            return Some(found);
        }
    }

    if let Some(position) = payload.get("position") {
        if let Some(found) = extract_lat_lon(position) {
            return Some(found);
        }
    }

    None
}

fn extract_lat_lon_from_location(location: &Value) -> Option<(f64, f64)> {
    if let Some(obj) = location.as_object() {
        let lat = obj
            .get("lat")
            .and_then(number_from_value)
            .or_else(|| obj.get("latitude").and_then(number_from_value));
        let lon = obj
            .get("lon")
            .and_then(number_from_value)
            .or_else(|| obj.get("lng").and_then(number_from_value))
            .or_else(|| obj.get("longitude").and_then(number_from_value));

        if let (Some(lat), Some(lon)) = (lat, lon) {
            if valid_lat_lon(lat, lon) {
                return Some((lat, lon));
            }
        }

        if let Some(coords) = obj.get("coordinates").and_then(Value::as_array) {
            if let Some(found) = lat_lon_from_coordinate_array(coords) {
                return Some(found);
            }
        }
    }

    if let Some(coords) = location.as_array() {
        if let Some(found) = lat_lon_from_coordinate_array(coords) {
            return Some(found);
        }
    }

    None
}

fn extract_lat_lon_from_geometry(geometry: &Value) -> Option<(f64, f64)> {
    if geometry
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        != "Point"
    {
        return None;
    }

    let coords = geometry.get("coordinates")?.as_array()?;
    lat_lon_from_coordinate_array(coords)
}

pub(crate) fn extract_visibility_m(payload: &Value) -> Option<f64> {
    let candidates = ["visibility_m", "visibility", "vis_m", "visibilityMeters"];

    for key in candidates {
        if let Some(value) = payload.get(key).and_then(number_from_value) {
            return Some(value);
        }
    }

    if let Some(current) = payload.get("current") {
        for key in candidates {
            if let Some(value) = current.get(key).and_then(number_from_value) {
                return Some(value);
            }
        }
    }

    None
}

fn number_from_value(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|s| s.parse::<f64>().ok()))
}

fn valid_lat_lon(lat: f64, lon: f64) -> bool {
    (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lon)
}

pub(crate) fn intersects_zone_ids(a: &[String], b: &[String]) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }

    if is_sorted(a) && is_sorted(b) {
        return intersects_sorted_zone_ids(a, b);
    }

    let (small, large) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    let small_set: HashSet<&str> = small.iter().map(String::as_str).collect();
    large
        .iter()
        .any(|zone_id| small_set.contains(zone_id.as_str()))
}

pub(crate) fn haversine_km(lat_a: f64, lon_a: f64, lat_b: f64, lon_b: f64) -> f64 {
    let earth_radius_km = 6371.0;
    let dlat = (lat_b - lat_a).to_radians();
    let dlon = (lon_b - lon_a).to_radians();

    let a = (dlat / 2.0).sin().powi(2)
        + lat_a.to_radians().cos() * lat_b.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();

    earth_radius_km * c
}

fn lat_lon_from_coordinate_array(coords: &[Value]) -> Option<(f64, f64)> {
    if coords.len() < 2 {
        return None;
    }

    let lon = number_from_value(coords.first()?)?;
    let lat = number_from_value(coords.get(1)?)?;
    valid_lat_lon(lat, lon).then_some((lat, lon))
}

fn is_sorted(zone_ids: &[String]) -> bool {
    zone_ids.windows(2).all(|window| window[0] <= window[1])
}

fn intersects_sorted_zone_ids(left: &[String], right: &[String]) -> bool {
    let mut left_idx = 0usize;
    let mut right_idx = 0usize;

    while left_idx < left.len() && right_idx < right.len() {
        match left[left_idx].cmp(&right[right_idx]) {
            std::cmp::Ordering::Less => left_idx += 1,
            std::cmp::Ordering::Greater => right_idx += 1,
            std::cmp::Ordering::Equal => return true,
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::{extract_lat_lon, extract_visibility_m, haversine_km, intersects_zone_ids};
    use serde_json::json;

    #[test]
    fn extract_lat_lon_supports_multiple_payload_shapes() {
        assert_eq!(
            extract_lat_lon(&json!({ "lat": 48.8566, "lon": 2.3522 })),
            Some((48.8566, 2.3522))
        );

        assert_eq!(
            extract_lat_lon(&json!({ "latitude": "40.64", "longitude": "-73.78" })),
            Some((40.64, -73.78))
        );

        assert_eq!(
            extract_lat_lon(&json!({ "location": { "coordinates": [2.3522, 48.8566] } })),
            Some((48.8566, 2.3522))
        );

        assert_eq!(
            extract_lat_lon(&json!({
                "geometry": { "type": "Point", "coordinates": [2.3522, 48.8566] }
            })),
            Some((48.8566, 2.3522))
        );

        assert_eq!(
            extract_lat_lon(&json!({
                "coordinates": [[2.3522, 48.8566], [2.40, 48.85]]
            })),
            Some((48.8566, 2.3522))
        );

        assert_eq!(
            extract_lat_lon(&json!({
                "coordinates": [2.3522, 48.8566]
            })),
            Some((48.8566, 2.3522))
        );
    }

    #[test]
    fn extract_visibility_handles_common_variants() {
        assert_eq!(
            extract_visibility_m(&json!({ "visibility_m": 850 })),
            Some(850.0)
        );
        assert_eq!(
            extract_visibility_m(&json!({ "visibility": "999" })),
            Some(999.0)
        );
        assert_eq!(
            extract_visibility_m(&json!({ "current": { "visibilityMeters": 650 } })),
            Some(650.0)
        );
    }

    #[test]
    fn zone_intersection_detects_overlap() {
        let left = vec!["paris".to_string(), "idf".to_string()];
        let right = vec!["lyon".to_string(), "idf".to_string()];
        assert!(intersects_zone_ids(&left, &right));
        assert!(!intersects_zone_ids(&left, &["berlin".to_string()]));

        let sorted_left = vec!["idf".to_string(), "paris".to_string()];
        let sorted_right = vec!["idf".to_string(), "lyon".to_string()];
        assert!(intersects_zone_ids(&sorted_left, &sorted_right));
    }

    #[test]
    fn haversine_returns_small_distance_for_nearby_points() {
        let distance = haversine_km(48.8566, 2.3522, 48.8570, 2.3530);
        assert!(distance > 0.0);
        assert!(distance < 0.1);
    }
}
