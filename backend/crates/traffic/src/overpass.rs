use anyhow::{Context, Result};
use tracing::{debug, warn};

use crate::parser;
use crate::types::{BoundingBox, Road};

const OVERPASS_URL: &str = "https://overpass-api.de/api/interpreter";

fn build_query(bbox: &BoundingBox) -> String {
    let (s, w, n, e) = (bbox.south, bbox.west, bbox.north, bbox.east);
    format!(
        r#"[out:json][timeout:30];
(
  way["highway"="motorway"]({s},{w},{n},{e});
  way["highway"="trunk"]({s},{w},{n},{e});
  way["highway"="primary"]({s},{w},{n},{e});
  way["highway"="secondary"]({s},{w},{n},{e});
);
out body;
>;
out skel qt;"#
    )
}

pub async fn fetch_roads(
    client: &reqwest::Client,
    bbox: &BoundingBox,
) -> Result<Vec<Road>> {
    let query = build_query(bbox);

    debug!(
        south = bbox.south,
        west = bbox.west,
        north = bbox.north,
        east = bbox.east,
        "fetching roads from Overpass"
    );

    let response = client
        .post(OVERPASS_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!("data={}", urlencoding(query.as_str())))
        .send()
        .await
        .context("failed to send Overpass request")?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        warn!(status = %status, "Overpass API returned error");
        anyhow::bail!("Overpass API returned {status}: {body}");
    }

    let json: serde_json::Value = response
        .json()
        .await
        .context("failed to parse Overpass JSON")?;

    let roads = parser::parse_overpass_response(&json)
        .context("failed to parse Overpass elements")?;

    debug!(count = roads.len(), "parsed roads from Overpass");
    Ok(roads)
}

fn urlencoding(input: &str) -> String {
    let mut result = String::with_capacity(input.len() * 2);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{byte:02X}"));
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_contains_bbox() {
        let bbox = BoundingBox {
            south: 48.8,
            west: 2.3,
            north: 48.9,
            east: 2.4,
        };
        let q = build_query(&bbox);
        assert!(q.contains("48.8"));
        assert!(q.contains("2.3"));
        assert!(q.contains("motorway"));
    }

    #[test]
    fn urlencoding_spaces() {
        assert_eq!(urlencoding("a b"), "a%20b");
    }
}
