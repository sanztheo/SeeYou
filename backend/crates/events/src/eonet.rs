use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::{EventCategory, NaturalEvent};

const EONET_URL: &str = "https://eonet.gsfc.nasa.gov/api/v3/events";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct EonetResponse {
    events: Vec<EonetEvent>,
}

#[derive(Deserialize)]
struct EonetEvent {
    id: String,
    title: String,
    categories: Vec<EonetCategory>,
    geometry: Vec<EonetGeometry>,
    sources: Option<Vec<EonetSource>>,
}

#[derive(Deserialize)]
struct EonetCategory {
    id: String,
}

#[derive(Deserialize)]
struct EonetGeometry {
    date: String,
    coordinates: Vec<f64>,
}

#[derive(Deserialize)]
struct EonetSource {
    url: String,
}

pub async fn fetch_active_events(client: &reqwest::Client) -> anyhow::Result<Vec<NaturalEvent>> {
    let resp: EonetResponse = client
        .get(EONET_URL)
        .query(&[("status", "open"), ("limit", "100")])
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("EONET request failed")?
        .error_for_status()
        .context("EONET returned error status")?
        .json()
        .await
        .context("failed to parse EONET response")?;

    let events = resp
        .events
        .into_iter()
        .filter_map(|e| {
            let geo = e.geometry.last()?;
            if geo.coordinates.len() < 2 {
                return None;
            }

            // GeoJSON: [longitude, latitude]
            let lon = geo.coordinates[0];
            let lat = geo.coordinates[1];

            let category = e
                .categories
                .first()
                .map(|c| EventCategory::from_eonet_id(&c.id))
                .unwrap_or(EventCategory::Other);

            let source_url = e
                .sources
                .as_ref()
                .and_then(|s| s.first().map(|s| s.url.clone()));

            Some(NaturalEvent {
                id: e.id,
                title: e.title,
                category,
                lat,
                lon,
                date: geo.date.clone(),
                source_url,
            })
        })
        .collect();

    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_eonet_event(
        id: &str,
        title: &str,
        category_id: &str,
        geometry: Vec<EonetGeometry>,
        source_url: Option<&str>,
    ) -> EonetEvent {
        EonetEvent {
            id: id.to_string(),
            title: title.to_string(),
            categories: vec![EonetCategory {
                id: category_id.to_string(),
            }],
            geometry,
            sources: source_url.map(|u| vec![EonetSource { url: u.to_string() }]),
        }
    }

    fn make_geometry(lon: f64, lat: f64, date: &str) -> EonetGeometry {
        EonetGeometry {
            date: date.to_string(),
            coordinates: vec![lon, lat],
        }
    }

    fn parse_eonet_events(eonet_events: Vec<EonetEvent>) -> Vec<NaturalEvent> {
        let resp = EonetResponse {
            events: eonet_events,
        };
        resp.events
            .into_iter()
            .filter_map(|e| {
                let geo = e.geometry.last()?;
                if geo.coordinates.len() < 2 {
                    return None;
                }
                let lon = geo.coordinates[0];
                let lat = geo.coordinates[1];
                let category = e
                    .categories
                    .first()
                    .map(|c| EventCategory::from_eonet_id(&c.id))
                    .unwrap_or(EventCategory::Other);
                let source_url = e
                    .sources
                    .as_ref()
                    .and_then(|s| s.first().map(|s| s.url.clone()));
                Some(NaturalEvent {
                    id: e.id,
                    title: e.title,
                    category,
                    lat,
                    lon,
                    date: geo.date.clone(),
                    source_url,
                })
            })
            .collect()
    }

    #[test]
    fn eonet_response_deserialization() {
        let json = r#"{
            "events": [
                {
                    "id": "EONET_100",
                    "title": "Test Wildfire",
                    "categories": [{"id": "wildfires"}],
                    "geometry": [{"date": "2026-02-28T00:00:00Z", "coordinates": [-118.0, 34.0]}],
                    "sources": [{"url": "https://example.com"}]
                }
            ]
        }"#;
        let resp: EonetResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.events.len(), 1);
        assert_eq!(resp.events[0].id, "EONET_100");
        assert_eq!(resp.events[0].categories[0].id, "wildfires");
    }

    #[test]
    fn geojson_coordinate_swap() {
        let events = parse_eonet_events(vec![make_eonet_event(
            "E1",
            "Fire",
            "wildfires",
            vec![make_geometry(-118.24, 34.05, "2026-01-01T00:00:00Z")],
            None,
        )]);

        assert_eq!(events.len(), 1);
        assert!(
            (events[0].lat - 34.05).abs() < f64::EPSILON,
            "lat should be 34.05"
        );
        assert!(
            (events[0].lon - (-118.24)).abs() < f64::EPSILON,
            "lon should be -118.24"
        );
    }

    #[test]
    fn takes_latest_geometry() {
        let events = parse_eonet_events(vec![make_eonet_event(
            "E2",
            "Moving Storm",
            "severeStorms",
            vec![
                make_geometry(10.0, 20.0, "2026-01-01T00:00:00Z"),
                make_geometry(11.0, 21.0, "2026-01-02T00:00:00Z"),
                make_geometry(12.0, 22.0, "2026-01-03T00:00:00Z"),
            ],
            None,
        )]);

        assert_eq!(events.len(), 1);
        assert!(
            (events[0].lon - 12.0).abs() < f64::EPSILON,
            "should use last geometry lon"
        );
        assert!(
            (events[0].lat - 22.0).abs() < f64::EPSILON,
            "should use last geometry lat"
        );
        assert_eq!(events[0].date, "2026-01-03T00:00:00Z");
    }

    #[test]
    fn filters_empty_geometry() {
        let events = parse_eonet_events(vec![make_eonet_event(
            "E3",
            "No Position",
            "floods",
            vec![],
            None,
        )]);

        assert!(
            events.is_empty(),
            "events with empty geometry should be filtered"
        );
    }

    #[test]
    fn filters_insufficient_coordinates() {
        let event = EonetEvent {
            id: "E4".to_string(),
            title: "Bad Coords".to_string(),
            categories: vec![EonetCategory {
                id: "floods".to_string(),
            }],
            geometry: vec![EonetGeometry {
                date: "2026-01-01T00:00:00Z".to_string(),
                coordinates: vec![10.0],
            }],
            sources: None,
        };

        let events = parse_eonet_events(vec![event]);
        assert!(
            events.is_empty(),
            "events with < 2 coordinates should be filtered"
        );
    }

    #[test]
    fn category_mapping_from_eonet() {
        let events = parse_eonet_events(vec![
            make_eonet_event(
                "E5",
                "A",
                "wildfires",
                vec![make_geometry(0.0, 0.0, "2026-01-01T00:00:00Z")],
                None,
            ),
            make_eonet_event(
                "E6",
                "B",
                "earthquakes",
                vec![make_geometry(1.0, 1.0, "2026-01-01T00:00:00Z")],
                None,
            ),
            make_eonet_event(
                "E7",
                "C",
                "unknownType",
                vec![make_geometry(2.0, 2.0, "2026-01-01T00:00:00Z")],
                None,
            ),
        ]);

        assert_eq!(events.len(), 3);
        assert_eq!(events[0].category, EventCategory::Wildfires);
        assert_eq!(events[1].category, EventCategory::Earthquakes);
        assert_eq!(events[2].category, EventCategory::Other);
    }

    #[test]
    fn source_url_extraction() {
        let with_source = parse_eonet_events(vec![make_eonet_event(
            "E8",
            "With Source",
            "floods",
            vec![make_geometry(0.0, 0.0, "2026-01-01T00:00:00Z")],
            Some("https://example.com/flood"),
        )]);
        assert_eq!(
            with_source[0].source_url.as_deref(),
            Some("https://example.com/flood")
        );

        let without_source = parse_eonet_events(vec![make_eonet_event(
            "E9",
            "No Source",
            "floods",
            vec![make_geometry(0.0, 0.0, "2026-01-01T00:00:00Z")],
            None,
        )]);
        assert!(without_source[0].source_url.is_none());
    }

    #[test]
    fn event_with_no_categories_defaults_to_other() {
        let event = EonetEvent {
            id: "E10".to_string(),
            title: "Uncategorized".to_string(),
            categories: vec![],
            geometry: vec![make_geometry(5.0, 5.0, "2026-01-01T00:00:00Z")],
            sources: None,
        };

        let events = parse_eonet_events(vec![event]);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].category, EventCategory::Other);
    }

    #[test]
    fn full_eonet_response_json_parsing() {
        let json = r#"{
            "events": [
                {
                    "id": "EONET_6732",
                    "title": "Wildfire - California, USA",
                    "categories": [{"id": "wildfires"}],
                    "geometry": [
                        {"date": "2026-02-25T00:00:00Z", "coordinates": [-119.5, 34.2]},
                        {"date": "2026-02-27T00:00:00Z", "coordinates": [-119.3, 34.4]}
                    ],
                    "sources": [{"url": "https://inciweb.nwcg.gov/incident/1234"}]
                },
                {
                    "id": "EONET_6733",
                    "title": "Tropical Storm Atlantic",
                    "categories": [{"id": "severeStorms"}],
                    "geometry": [
                        {"date": "2026-02-28T12:00:00Z", "coordinates": [-65.0, 18.0]}
                    ],
                    "sources": null
                }
            ]
        }"#;
        let resp: EonetResponse = serde_json::from_str(json).unwrap();
        let events = parse_eonet_events(resp.events);

        assert_eq!(events.len(), 2);

        assert_eq!(events[0].id, "EONET_6732");
        assert!(
            (events[0].lon - (-119.3)).abs() < f64::EPSILON,
            "should use latest geometry"
        );
        assert!((events[0].lat - 34.4).abs() < f64::EPSILON);
        assert_eq!(events[0].category, EventCategory::Wildfires);
        assert!(events[0].source_url.is_some());

        assert_eq!(events[1].id, "EONET_6733");
        assert_eq!(events[1].category, EventCategory::SevereStorms);
        assert!(events[1].source_url.is_none());
    }
}
