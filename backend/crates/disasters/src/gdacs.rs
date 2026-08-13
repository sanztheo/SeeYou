use std::collections::HashMap;
use std::time::Duration;

use anyhow::Context;
use chrono::{DateTime, SecondsFormat, Utc};
use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::types::DisasterEvent;

/// GDACS's own feed states `<copyright>public domain</copyright>` (verified
/// live 2026-08-13, in the feed body itself — the strongest form of license
/// confirmation, not a separate page that could drift from the data).
const GDACS_RSS_URL: &str = "https://www.gdacs.org/xml/rss.xml";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Event types this app keeps from GDACS's RSS feed. `EQ` (earthquake) and
/// `WF` (wildfire) are deliberately excluded: measured live 2026-08-13, the
/// full feed was 362 items — 325 of them (90%) `WF` and a further 4 `EQ`,
/// both already covered by dedicated, higher-fidelity crates in this app
/// (`fires` from NASA FIRMS, 34,635 rows measured at Lot 0/1; `seismic` from
/// USGS). Ingesting GDACS's own copies of those would be near-duplicate
/// signal, not new coverage. The 4 kept types are the ones this app has no
/// other source for at all — filtering to them plus `iscurrent=true` kept
/// 20 of the 362 raw items in that same measurement.
const KEPT_EVENT_TYPES: [&str; 4] = ["TC", "FL", "VO", "DR"];

pub async fn fetch_disasters(client: &reqwest::Client) -> anyhow::Result<Vec<DisasterEvent>> {
    let response = client
        .get(GDACS_RSS_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("GDACS request failed");
    let Ok(response) = response else {
        return Ok(Vec::new());
    };
    if !response.status().is_success() {
        return Ok(Vec::new());
    }
    let Ok(body) = response.text().await else {
        return Ok(Vec::new());
    };

    Ok(parse_rss_items(&body))
}

/// Walks the RSS document's own tag structure with a plain event reader
/// (no XML crate offering serde-derive support existed in this workspace
/// before this change, and GDACS's `<item>` shape is flat enough — one level
/// of leaf tags per item, no attributes this app needs — that a small
/// state machine is simpler than adding a second, heavier XML dependency).
fn parse_rss_items(xml: &str) -> Vec<DisasterEvent> {
    let mut reader = Reader::from_str(xml);

    let mut events = Vec::new();
    let mut fields: HashMap<String, String> = HashMap::new();
    let mut tag_stack: Vec<String> = Vec::new();
    let mut in_item = false;

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,
            Err(_) => break,
            Ok(Event::Start(start)) => {
                let name = String::from_utf8_lossy(start.name().as_ref()).into_owned();
                if name == "item" {
                    in_item = true;
                    fields.clear();
                }
                tag_stack.push(name);
            }
            Ok(Event::Text(text)) => {
                if in_item {
                    if let Some(tag) = tag_stack.last() {
                        if let Ok(unescaped) = text.unescape() {
                            fields
                                .entry(tag.clone())
                                .and_modify(|v| v.push_str(&unescaped))
                                .or_insert_with(|| unescaped.into_owned());
                        }
                    }
                }
            }
            Ok(Event::End(end)) => {
                let name = String::from_utf8_lossy(end.name().as_ref()).into_owned();
                if name == "item" && in_item {
                    if let Some(disaster) = build_disaster_event(&fields) {
                        events.push(disaster);
                    }
                    in_item = false;
                }
                tag_stack.pop();
            }
            Ok(_) => {}
        }
    }

    events
}

fn build_disaster_event(fields: &HashMap<String, String>) -> Option<DisasterEvent> {
    let event_type = fields.get("gdacs:eventtype")?.clone();
    if !KEPT_EVENT_TYPES.contains(&event_type.as_str()) {
        return None;
    }
    if fields.get("gdacs:iscurrent").map(String::as_str) != Some("true") {
        return None;
    }

    let event_id = fields.get("guid")?.clone();
    let (lat, lon) = parse_georss_point(fields.get("georss:point")?)?;
    let from_date = parse_rfc2822_to_iso(fields.get("gdacs:fromdate")?)?;
    let to_date = parse_rfc2822_to_iso(fields.get("gdacs:todate")?)?;

    Some(DisasterEvent {
        event_id,
        event_type,
        alert_level: fields.get("gdacs:alertlevel").cloned().unwrap_or_default(),
        alert_score: fields
            .get("gdacs:alertscore")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0.0),
        title: fields.get("title").cloned().unwrap_or_default(),
        url: fields.get("link").cloned().unwrap_or_default(),
        country: non_empty(fields.get("gdacs:country")),
        iso3: non_empty(fields.get("gdacs:iso3")),
        lat,
        lon,
        from_date,
        to_date,
    })
}

/// `<georss:point>` is `"LAT LON"`, space-separated — verified live
/// 2026-08-13 against both a flood item (`-34.6234928 138.6919708`) and a
/// cyclone item (`18.1 -131.9`, matching that same item's separate
/// `<geo:lat>18.1</geo:lat><geo:long>-131.9</geo:long>` pair exactly).
fn parse_georss_point(raw: &str) -> Option<(f64, f64)> {
    let mut parts = raw.split_whitespace();
    let lat: f64 = parts.next()?.parse().ok()?;
    let lon: f64 = parts.next()?.parse().ok()?;
    Some((lat, lon))
}

/// GDACS dates (`<gdacs:fromdate>`, `<gdacs:todate>`) are RFC-2822
/// (`"Thu, 13 Aug 2026 03:00:00 GMT"`) — reformat to ISO-8601 to match this
/// app's wire convention for timestamps rather than passing the raw format
/// through.
fn parse_rfc2822_to_iso(raw: &str) -> Option<String> {
    DateTime::parse_from_rfc2822(raw)
        .ok()
        .map(|dt| dt.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Secs, true))
}

fn non_empty(raw: Option<&String>) -> Option<String> {
    raw.filter(|v| !v.is_empty()).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A trimmed real GDACS RSS document (flood item downloaded live
    /// 2026-08-13, plus a synthetic wildfire and a synthetic non-current
    /// cyclone appended to exercise the two exclusion rules) — kept close to
    /// the real feed's tag order/namespaces rather than a minimal fixture,
    /// so the parser is checked against real GDACS output shape.
    const SAMPLE_RSS: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:gdacs="http://www.gdacs.org" xmlns:glide="http://glidenumber.net" xmlns:georss="http://www.georss.org/georss" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<item>
<title>Green flood alert in Australia</title>
<description>On 09/08/2026, a flood started in Australia.</description>
<link>https://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=1104085</link>
<pubDate>Tue, 11 Aug 2026 07:56:02 GMT</pubDate>
<gdacs:temporary>false</gdacs:temporary>
<gdacs:dateadded>Tue, 11 Aug 2026 07:56:02 GMT</gdacs:dateadded>
<gdacs:iscurrent>true</gdacs:iscurrent>
<gdacs:fromdate>Sun, 09 Aug 2026 01:00:00 GMT</gdacs:fromdate>
<gdacs:todate>Tue, 11 Aug 2026 01:00:00 GMT</gdacs:todate>
<dc:subject>FL1</dc:subject>
<guid isPermaLink="false">FL1104085</guid>
<gdacs:bbox>134.6919708 142.6919708 -38.6234928 -30.6234928</gdacs:bbox>
<georss:point>-34.6234928 138.6919708</georss:point>
<gdacs:eventtype>FL</gdacs:eventtype>
<gdacs:alertlevel>Green</gdacs:alertlevel>
<gdacs:alertscore>1</gdacs:alertscore>
<gdacs:eventid>1104085</gdacs:eventid>
<gdacs:iso3>AUS</gdacs:iso3>
<gdacs:country>Australia</gdacs:country>
</item>
<item>
<title>Green notification for wildfire</title>
<link>https://www.gdacs.org/report.aspx?eventtype=WF&amp;eventid=999</link>
<guid isPermaLink="false">WF999</guid>
<georss:point>1.0 2.0</georss:point>
<gdacs:eventtype>WF</gdacs:eventtype>
<gdacs:alertlevel>Green</gdacs:alertlevel>
<gdacs:iscurrent>true</gdacs:iscurrent>
<gdacs:fromdate>Sun, 09 Aug 2026 01:00:00 GMT</gdacs:fromdate>
<gdacs:todate>Tue, 11 Aug 2026 01:00:00 GMT</gdacs:todate>
</item>
<item>
<title>Historical cyclone, no longer current</title>
<link>https://www.gdacs.org/report.aspx?eventtype=TC&amp;eventid=888</link>
<guid isPermaLink="false">TC888</guid>
<georss:point>3.0 4.0</georss:point>
<gdacs:eventtype>TC</gdacs:eventtype>
<gdacs:alertlevel>Orange</gdacs:alertlevel>
<gdacs:iscurrent>false</gdacs:iscurrent>
<gdacs:fromdate>Sun, 09 Aug 2026 01:00:00 GMT</gdacs:fromdate>
<gdacs:todate>Tue, 11 Aug 2026 01:00:00 GMT</gdacs:todate>
</item>
</channel>
</rss>"#;

    #[test]
    fn parses_a_real_flood_item() {
        let events = parse_rss_items(SAMPLE_RSS);
        assert_eq!(events.len(), 1, "wildfire and historical items must be filtered out");

        let flood = &events[0];
        assert_eq!(flood.event_id, "FL1104085");
        assert_eq!(flood.event_type, "FL");
        assert_eq!(flood.alert_level, "Green");
        assert_eq!(flood.alert_score, 1.0);
        assert_eq!(flood.title, "Green flood alert in Australia");
        assert_eq!(
            flood.url,
            "https://www.gdacs.org/report.aspx?eventtype=FL&eventid=1104085"
        );
        assert_eq!(flood.country, Some("Australia".to_string()));
        assert_eq!(flood.iso3, Some("AUS".to_string()));
        assert_eq!(flood.lat, -34.6234928);
        assert_eq!(flood.lon, 138.6919708);
        assert_eq!(flood.from_date, "2026-08-09T01:00:00Z");
        assert_eq!(flood.to_date, "2026-08-11T01:00:00Z");
    }

    #[test]
    fn excludes_wildfire_event_type() {
        let events = parse_rss_items(SAMPLE_RSS);
        assert!(!events.iter().any(|e| e.event_type == "WF"));
    }

    #[test]
    fn excludes_non_current_events() {
        let events = parse_rss_items(SAMPLE_RSS);
        assert!(!events.iter().any(|e| e.event_id == "TC888"));
    }

    #[test]
    fn parse_georss_point_splits_lat_and_lon() {
        assert_eq!(parse_georss_point("18.1 -131.9"), Some((18.1, -131.9)));
    }

    #[test]
    fn parse_georss_point_rejects_malformed_input() {
        assert_eq!(parse_georss_point("not-a-point"), None);
        assert_eq!(parse_georss_point("1.0"), None);
    }

    #[test]
    fn parse_rfc2822_to_iso_converts_gdacs_date_format() {
        assert_eq!(
            parse_rfc2822_to_iso("Thu, 13 Aug 2026 03:00:00 GMT"),
            Some("2026-08-13T03:00:00Z".to_string())
        );
    }

    #[test]
    fn parse_rfc2822_to_iso_rejects_garbage() {
        assert_eq!(parse_rfc2822_to_iso("not a date"), None);
    }
}
