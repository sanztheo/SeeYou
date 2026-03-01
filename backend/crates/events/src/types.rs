use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum EventCategory {
    Wildfires,
    SevereStorms,
    Volcanoes,
    Earthquakes,
    Floods,
    SeaAndLakeIce,
    Other,
}

impl EventCategory {
    pub fn from_eonet_id(id: &str) -> Self {
        match id {
            "wildfires" => Self::Wildfires,
            "severeStorms" => Self::SevereStorms,
            "volcanoes" => Self::Volcanoes,
            "earthquakes" => Self::Earthquakes,
            "floods" => Self::Floods,
            "seaLakeIce" => Self::SeaAndLakeIce,
            _ => Self::Other,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NaturalEvent {
    pub id: String,
    pub title: String,
    pub category: EventCategory,
    pub lat: f64,
    pub lon: f64,
    pub date: String,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventsResponse {
    pub events: Vec<NaturalEvent>,
    pub fetched_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_category_from_known_ids() {
        assert_eq!(EventCategory::from_eonet_id("wildfires"), EventCategory::Wildfires);
        assert_eq!(EventCategory::from_eonet_id("severeStorms"), EventCategory::SevereStorms);
        assert_eq!(EventCategory::from_eonet_id("volcanoes"), EventCategory::Volcanoes);
        assert_eq!(EventCategory::from_eonet_id("earthquakes"), EventCategory::Earthquakes);
        assert_eq!(EventCategory::from_eonet_id("floods"), EventCategory::Floods);
        assert_eq!(EventCategory::from_eonet_id("seaLakeIce"), EventCategory::SeaAndLakeIce);
    }

    #[test]
    fn event_category_unknown_defaults_to_other() {
        assert_eq!(EventCategory::from_eonet_id("unknown"), EventCategory::Other);
        assert_eq!(EventCategory::from_eonet_id(""), EventCategory::Other);
        assert_eq!(EventCategory::from_eonet_id("newCategory2026"), EventCategory::Other);
        assert_eq!(EventCategory::from_eonet_id("Wildfires"), EventCategory::Other);
    }

    #[test]
    fn event_category_is_case_sensitive() {
        assert_ne!(EventCategory::from_eonet_id("Wildfires"), EventCategory::Wildfires);
        assert_ne!(EventCategory::from_eonet_id("FLOODS"), EventCategory::Floods);
        assert_ne!(EventCategory::from_eonet_id("SevereStorms"), EventCategory::SevereStorms);
    }

    fn sample_event() -> NaturalEvent {
        NaturalEvent {
            id: "EONET_1234".to_string(),
            title: "Wildfire in California".to_string(),
            category: EventCategory::Wildfires,
            lat: 34.05,
            lon: -118.24,
            date: "2026-02-28T12:00:00Z".to_string(),
            source_url: Some("https://example.com/event/1234".to_string()),
        }
    }

    #[test]
    fn natural_event_serialization_roundtrip() {
        let event = sample_event();
        let json = serde_json::to_string(&event).unwrap();
        let decoded: NaturalEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.id, "EONET_1234");
        assert_eq!(decoded.title, "Wildfire in California");
        assert_eq!(decoded.category, EventCategory::Wildfires);
        assert!((decoded.lat - 34.05).abs() < f64::EPSILON);
        assert!((decoded.lon - (-118.24)).abs() < f64::EPSILON);
        assert_eq!(decoded.date, "2026-02-28T12:00:00Z");
        assert_eq!(decoded.source_url.as_deref(), Some("https://example.com/event/1234"));
    }

    #[test]
    fn natural_event_with_no_source_url() {
        let event = NaturalEvent {
            source_url: None,
            ..sample_event()
        };
        let json = serde_json::to_string(&event).unwrap();
        let decoded: NaturalEvent = serde_json::from_str(&json).unwrap();
        assert!(decoded.source_url.is_none());
    }

    #[test]
    fn events_response_serialization() {
        let resp = EventsResponse {
            events: vec![sample_event()],
            fetched_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("events"));
        assert!(json.contains("fetched_at"));
        assert!(json.contains("EONET_1234"));

        let decoded: EventsResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.events.len(), 1);
        assert_eq!(decoded.fetched_at, "2026-01-01T00:00:00Z");
    }

    #[test]
    fn events_response_empty_events() {
        let resp = EventsResponse {
            events: vec![],
            fetched_at: "2026-03-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        let decoded: EventsResponse = serde_json::from_str(&json).unwrap();
        assert!(decoded.events.is_empty());
    }

    #[test]
    fn event_category_serialization_roundtrip() {
        let categories = [
            EventCategory::Wildfires,
            EventCategory::SevereStorms,
            EventCategory::Volcanoes,
            EventCategory::Earthquakes,
            EventCategory::Floods,
            EventCategory::SeaAndLakeIce,
            EventCategory::Other,
        ];
        for cat in &categories {
            let json = serde_json::to_string(cat).unwrap();
            let decoded: EventCategory = serde_json::from_str(&json).unwrap();
            assert_eq!(&decoded, cat);
        }
    }

    #[test]
    fn event_category_hash_uniqueness() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(EventCategory::Wildfires);
        set.insert(EventCategory::SevereStorms);
        set.insert(EventCategory::Volcanoes);
        set.insert(EventCategory::Earthquakes);
        set.insert(EventCategory::Floods);
        set.insert(EventCategory::SeaAndLakeIce);
        set.insert(EventCategory::Other);
        assert_eq!(set.len(), 7);

        set.insert(EventCategory::Wildfires);
        assert_eq!(set.len(), 7, "duplicate insert should not increase set size");
    }
}
