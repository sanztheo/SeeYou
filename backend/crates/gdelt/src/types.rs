use serde::{Deserialize, Serialize};

/// A single GDELT Event 2.0 record (see `api.rs` for the CSV column
/// mapping). Fields intentionally diverge from the old GEO-2.0-API-backed
/// shape this replaced — that API geotagged news *articles* matching a
/// keyword search; this is a raw event between actors, GDELT's own unit of
/// data. Two fields keep the pre-existing name but changed meaning, and one
/// existing field was dropped outright; each is called out below because a
/// future reader diffing against an old payload needs to know this wasn't
/// silently mangled:
///
/// - `tone`: was one article's tone; now `AvgTone`, the average tone of all
///   source documents behind this event in the current 15-minute batch.
///   Same concept (coverage sentiment), same rough scale, just averaged.
/// - `source_country`: was the reporting outlet's *own* declared country
///   (`sourcecountry` on the GEO API). Event 2.0 has no such concept, so
///   this is now `ActionGeo_CountryCode` — the FIPS 10-4 code of *where the
///   event happened*, a different fact about a different place. Kept under
///   the same field name only because a frontend type already expects an
///   `Option<string>` here and losing it entirely would regress the popup
///   for no reason; the meaning changed, note it if you consume this field.
/// - `image_url`: no equivalent exists in Event 2.0 (no article, no
///   thumbnail). Always `None` now. Kept in the struct (rather than removed)
///   so the REST/WS wire shape doesn't lose a field consumers may still
///   reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GdeltEvent {
    pub event_id: String,
    pub event_date: String,
    pub title: String,
    pub url: String,
    pub lat: f64,
    pub lon: f64,
    pub tone: f64,
    pub domain: String,
    pub event_code: String,
    pub quad_class: u8,
    pub num_mentions: u32,
    pub num_sources: u32,
    pub source_country: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GdeltResponse {
    pub events: Vec<GdeltEvent>,
    pub fetched_at: String,
}
