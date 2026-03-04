/// Clamp a camera field-of-view value to a sane display range.
pub fn clamp_fov_deg(fov_deg: f64) -> f64 {
    fov_deg.clamp(20.0, 120.0)
}

/// Default field-of-view by provider family.
pub fn default_fov_for_source(source: &str) -> f64 {
    let s = source.to_ascii_lowercase();
    if s == "caltrans" || s == "nycdot" || s == "tfl" || s.starts_with("otcmap") {
        return 42.0;
    }
    if s == "mcp.camera" {
        return 50.0;
    }
    if s == "generic" || s == "paris_opendata" {
        return 68.0;
    }
    55.0
}

fn token_heading(token: &str) -> Option<f64> {
    match token {
        "N" | "NORTH" | "NB" => Some(0.0),
        "NE" | "NORTHEAST" | "NORTHEASTBOUND" => Some(45.0),
        "E" | "EAST" | "EB" => Some(90.0),
        "SE" | "SOUTHEAST" | "SOUTHEASTBOUND" => Some(135.0),
        "S" | "SOUTH" | "SB" => Some(180.0),
        "SW" | "SOUTHWEST" | "SOUTHWESTBOUND" => Some(225.0),
        "W" | "WEST" | "WB" => Some(270.0),
        "NW" | "NORTHWEST" | "NORTHWESTBOUND" => Some(315.0),
        _ => None,
    }
}

/// Parse an orientation hint into heading degrees (0° north, 90° east).
/// Accepts formats like "West", "NB", "East Facing", "southbound".
pub fn parse_heading_from_hint(hint: &str) -> Option<f64> {
    let trimmed = hint.trim();
    if trimmed.is_empty() {
        return None;
    }

    let upper = trimmed.to_ascii_uppercase();
    if upper.contains("NORTHEAST") {
        return Some(45.0);
    }
    if upper.contains("SOUTHEAST") {
        return Some(135.0);
    }
    if upper.contains("SOUTHWEST") {
        return Some(225.0);
    }
    if upper.contains("NORTHWEST") {
        return Some(315.0);
    }
    if upper.contains("NORTHBOUND") {
        return Some(0.0);
    }
    if upper.contains("EASTBOUND") {
        return Some(90.0);
    }
    if upper.contains("SOUTHBOUND") {
        return Some(180.0);
    }
    if upper.contains("WESTBOUND") {
        return Some(270.0);
    }

    let mut clean = String::with_capacity(upper.len());
    for ch in upper.chars() {
        if ch.is_ascii_alphanumeric() {
            clean.push(ch);
        } else {
            clean.push(' ');
        }
    }

    for token in clean.split_whitespace() {
        if let Some(deg) = token_heading(token) {
            return Some(deg);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cardinal_words() {
        assert_eq!(parse_heading_from_hint("West"), Some(270.0));
        assert_eq!(parse_heading_from_hint("East Facing"), Some(90.0));
        assert_eq!(
            parse_heading_from_hint("South (Earls Court Road)"),
            Some(180.0)
        );
        assert_eq!(parse_heading_from_hint("Zoom north - Lansdowne"), Some(0.0));
    }

    #[test]
    fn parse_abbreviations() {
        assert_eq!(parse_heading_from_hint("NB"), Some(0.0));
        assert_eq!(parse_heading_from_hint("EB"), Some(90.0));
        assert_eq!(parse_heading_from_hint("SB"), Some(180.0));
        assert_eq!(parse_heading_from_hint("WB"), Some(270.0));
        assert_eq!(parse_heading_from_hint("NE"), Some(45.0));
    }

    #[test]
    fn parse_bounds_and_compounds() {
        assert_eq!(parse_heading_from_hint("northbound"), Some(0.0));
        assert_eq!(parse_heading_from_hint("SOUTHWESTBOUND"), Some(225.0));
        assert_eq!(parse_heading_from_hint("towards southeast"), Some(135.0));
    }

    #[test]
    fn parse_returns_none_when_no_direction() {
        assert_eq!(parse_heading_from_hint("Piccadilly Circus"), None);
        assert_eq!(parse_heading_from_hint(""), None);
        assert_eq!(parse_heading_from_hint("A406/7293B"), None);
    }

    #[test]
    fn source_fov_defaults() {
        assert_eq!(default_fov_for_source("caltrans"), 42.0);
        assert_eq!(default_fov_for_source("otcmap_alabama"), 42.0);
        assert_eq!(default_fov_for_source("mcp.camera"), 50.0);
        assert_eq!(default_fov_for_source("generic"), 68.0);
        assert_eq!(default_fov_for_source("unknown"), 55.0);
    }

    #[test]
    fn fov_is_clamped() {
        assert_eq!(clamp_fov_deg(5.0), 20.0);
        assert_eq!(clamp_fov_deg(55.0), 55.0);
        assert_eq!(clamp_fov_deg(160.0), 120.0);
    }
}
