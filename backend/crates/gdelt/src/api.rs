use std::io::Read;
use std::time::Duration;

use anyhow::Context;
use tracing::warn;

use crate::types::GdeltEvent;

/// GDELT publishes a new Event 2.0 export every 15 minutes and lists the
/// current file names here — verified live on 2026-08-13 (`curl` returned a
/// 320-byte, 3-line body). This replaces the previous implementation, which
/// called `https://api.gdeltproject.org/api/v2/geo/geo?query=*&...`: that
/// endpoint geotags news *articles* matching a search query and returns 404
/// on a bare `query=*` (verified live, same date) — it was never the right
/// endpoint for "the events GDELT published," and no query string makes it
/// one. The raw Event 2.0 file feed below is GDELT's actual events firehose.
///
/// Why `storage.googleapis.com` and not GDELT's own host: `https://` on
/// `data.gdeltproject.org` serves an invalid certificate
/// (`*.storage.googleapis.com`, SAN mismatch — verified live 2026-08-13),
/// so on that hostname plain HTTP is the only working option. The files
/// actually live in a GCS bucket named after the host, and GCS's
/// bucket-in-path form serves the same bytes with a valid certificate
/// (verified live, same date: identical `lastupdate.txt` body, `HTTP/2
/// 200` on an export zip). Event data feeding this app's graph shouldn't
/// travel over tamperable plaintext when a TLS path to the same bucket
/// exists.
const GDELT_DATA_HOST: &str = "data.gdeltproject.org";
const GCS_BASE_URL: &str = "https://storage.googleapis.com/data.gdeltproject.org";
const LAST_UPDATE_URL: &str =
    "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/lastupdate.txt";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Anti-noise filter (`docs/plans/sources.md`): a raw 15-minute export
/// carries ~1,200 events (measured 2026-08-13, `20260813110000.export.CSV`,
/// 1198 rows) — ~115k/day at GDELT's own cadence, matching GDELT's own
/// "~100k events/day" figure. `NumSources` looks like the obvious threshold
/// but is useless in practice: in that same sample 1155/1198 rows (96%) had
/// `NumSources` of exactly 1 or 2 — it counts distinct source *documents*
/// within this one 15-minute batch, not total corroborating coverage, and
/// GDELT's own users mostly rely on `NumMentions` instead for that reason.
/// `NumMentions >= 10` kept 192/1198 rows (16%) in the same sample — real,
/// multiply-reported events, not single-blogger noise — for an estimated
/// ~18,400/day flowing into the graph, the same order of magnitude as this
/// app's `fire_hotspot` layer (34,635 rows measured at Lot 0/1).
const MIN_NUM_MENTIONS: u32 = 10;

// GDELT Event 2.0 is a fixed 61-column, tab-separated file with no header
// row. Column layout verified against a live file downloaded 2026-08-13
// (`20260813110000.export.CSV`): each index below was cross-checked against
// real row contents (e.g. index 51 holds `4`/`1` matching the documented
// ActionGeo_Type values, index 56/57 hold real lat/lon pairs), not taken on
// faith from the (correct, as it turned out) documented schema alone.
const COL_GLOBAL_EVENT_ID: usize = 0;
const COL_SQLDATE: usize = 1;
const COL_ACTOR1_NAME: usize = 6;
const COL_ACTOR2_NAME: usize = 16;
const COL_EVENT_CODE: usize = 26;
const COL_QUAD_CLASS: usize = 29;
const COL_NUM_MENTIONS: usize = 31;
const COL_NUM_SOURCES: usize = 32;
const COL_AVG_TONE: usize = 34;
const COL_ACTION_GEO_COUNTRY_CODE: usize = 53;
const COL_ACTION_GEO_LAT: usize = 56;
const COL_ACTION_GEO_LONG: usize = 57;
const COL_SOURCE_URL: usize = 60;
const EXPECTED_COLUMNS: usize = 61;

// Every degrade-to-empty point below logs a `warn!` with the specific stage
// that failed. This isn't cosmetic: during this task's own verification, one
// run silently returned `count=0` for ~20 minutes against a source that a
// parallel diagnostic proved was healthy the whole time (176 real,
// filter-passing rows). Every prior version of this function's fallbacks
// swallowed the reason into an indistinguishable `Ok(Vec::new())` — the same
// log line either meant "GDELT is fine, nothing met the anti-noise
// threshold this cycle" or "something failed," with no way to tell which
// from the running app's own logs. Root-causing that took a throwaway
// `#[ignore]` test hitting the live network by hand; a warn! at each site
// would have shown the answer immediately.
pub async fn fetch_events(client: &reqwest::Client) -> anyhow::Result<Vec<GdeltEvent>> {
    let Some(csv_url) = fetch_latest_export_url(client).await? else {
        return Ok(Vec::new());
    };

    let response = client
        .get(&csv_url)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("GDELT export download failed");
    let Ok(response) = response else {
        warn!(url = %csv_url, "GDELT export download request failed");
        return Ok(Vec::new());
    };
    if !response.status().is_success() {
        warn!(url = %csv_url, status = %response.status(), "GDELT export download returned non-success status");
        return Ok(Vec::new());
    }
    let Ok(zip_bytes) = response.bytes().await else {
        warn!(url = %csv_url, "GDELT export response body failed to read");
        return Ok(Vec::new());
    };

    let Some(csv_text) = extract_first_file_from_zip(&zip_bytes) else {
        warn!(url = %csv_url, bytes = zip_bytes.len(), "GDELT export zip failed to extract");
        return Ok(Vec::new());
    };

    let events = parse_export_csv(&csv_text);
    if events.is_empty() {
        warn!(
            url = %csv_url,
            csv_rows = csv_text.lines().count(),
            "GDELT export parsed with zero rows meeting the NumMentions/geo filter this cycle"
        );
    }

    Ok(events)
}

/// `lastupdate.txt` is three space-separated `size hash url` lines (export,
/// mentions, gkg) — this app only needs the `.export.CSV.zip` one.
async fn fetch_latest_export_url(client: &reqwest::Client) -> anyhow::Result<Option<String>> {
    let response = client
        .get(LAST_UPDATE_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("GDELT lastupdate.txt request failed");
    let Ok(response) = response else {
        warn!("GDELT lastupdate.txt request failed");
        return Ok(None);
    };
    if !response.status().is_success() {
        warn!(status = %response.status(), "GDELT lastupdate.txt returned non-success status");
        return Ok(None);
    }
    let Ok(body) = response.text().await else {
        warn!("GDELT lastupdate.txt response body failed to read");
        return Ok(None);
    };

    let export_url = body
        .lines()
        .find_map(|line| line.split_whitespace().nth(2))
        .filter(|url| url.ends_with(".export.CSV.zip"))
        .and_then(to_verified_https_url);

    if export_url.is_none() {
        warn!(body = %body, "GDELT lastupdate.txt had no usable .export.CSV.zip line");
    }

    Ok(export_url)
}

/// `lastupdate.txt` lists plain-`http://data.gdeltproject.org/...` URLs
/// verbatim. Rewrite to the TLS-valid GCS form (see `LAST_UPDATE_URL`),
/// rejecting any URL not on GDELT's own data host — the fetched URL decides
/// what ends up in this app's graph, so it must not be attacker-choosable
/// even if the listing body were tampered with.
fn to_verified_https_url(listed_url: &str) -> Option<String> {
    let parsed = url::Url::parse(listed_url).ok()?;
    if parsed.host_str() != Some(GDELT_DATA_HOST) {
        return None;
    }
    Some(format!("{GCS_BASE_URL}{}", parsed.path()))
}

fn extract_first_file_from_zip(bytes: &[u8]) -> Option<String> {
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).ok()?;
    let mut file = archive.by_index(0).ok()?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).ok()?;
    Some(contents)
}

fn parse_export_csv(csv_text: &str) -> Vec<GdeltEvent> {
    csv_text
        .lines()
        .filter_map(parse_export_row)
        .filter(|event| event.num_mentions >= MIN_NUM_MENTIONS)
        .collect()
}

fn parse_export_row(line: &str) -> Option<GdeltEvent> {
    let cols: Vec<&str> = line.split('\t').collect();
    if cols.len() < EXPECTED_COLUMNS {
        return None;
    }

    let lat: f64 = cols[COL_ACTION_GEO_LAT].parse().ok()?;
    let lon: f64 = cols[COL_ACTION_GEO_LONG].parse().ok()?;
    let num_mentions: u32 = cols[COL_NUM_MENTIONS].parse().ok()?;
    let num_sources: u32 = cols[COL_NUM_SOURCES].parse().unwrap_or(0);
    let quad_class: u8 = cols[COL_QUAD_CLASS].parse().unwrap_or(0);
    let tone: f64 = cols[COL_AVG_TONE].parse().unwrap_or(0.0);
    let source_url = cols[COL_SOURCE_URL].to_string();

    Some(GdeltEvent {
        event_id: cols[COL_GLOBAL_EVENT_ID].to_string(),
        event_date: format_sqldate(cols[COL_SQLDATE]),
        title: synthesize_title(cols[COL_ACTOR1_NAME], cols[COL_ACTOR2_NAME], quad_class),
        domain: domain_from_url(&source_url),
        url: source_url,
        lat,
        lon,
        tone,
        event_code: cols[COL_EVENT_CODE].to_string(),
        quad_class,
        num_mentions,
        num_sources,
        source_country: non_empty(cols[COL_ACTION_GEO_COUNTRY_CODE]),
        image_url: None,
    })
}

/// `SQLDATE` is `YYYYMMDD` with no separators (e.g. `20260813`) — reformat to
/// ISO-8601 date (`2026-08-13`) to match this app's wire convention rather
/// than passing the raw GDELT digit string through.
fn format_sqldate(raw: &str) -> String {
    if raw.len() != 8 {
        return raw.to_string();
    }
    format!("{}-{}-{}", &raw[0..4], &raw[4..6], &raw[6..8])
}

fn quad_class_label(quad_class: u8) -> &'static str {
    match quad_class {
        1 => "verbal cooperation",
        2 => "material cooperation",
        3 => "verbal conflict",
        4 => "material conflict",
        _ => "unclassified",
    }
}

/// GDELT Event 2.0 has no headline field (unlike the old GEO API's article
/// `name`) — an event is an interaction between actors, not an article. This
/// builds an honest label from what the row actually contains rather than
/// inventing prose: the actor(s) plus GDELT's own 4-value QuadClass
/// taxonomy, never a guessed description of what happened.
fn synthesize_title(actor1_name: &str, actor2_name: &str, quad_class: u8) -> String {
    let label = quad_class_label(quad_class);
    let (a1, a2) = (actor1_name.trim(), actor2_name.trim());

    match (a1.is_empty(), a2.is_empty()) {
        (false, false) => format!("{a1} \u{2192} {a2} ({label})"),
        (false, true) => format!("{a1} ({label})"),
        _ => format!("Unspecified actors ({label})"),
    }
}

fn domain_from_url(raw_url: &str) -> String {
    url::Url::parse(raw_url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_default()
}

fn non_empty(raw: &str) -> Option<String> {
    (!raw.is_empty()).then(|| raw.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real row from `20260813110000.export.CSV` (downloaded and verified
    /// live 2026-08-13), reproduced verbatim so the column indices are
    /// checked against actual GDELT output, not a hand-built fixture that
    /// could encode the same indexing mistake as the code under test.
    const REAL_ROW: &str = "1318092222\t20250813\t202508\t2025\t2025.6110\tIND\tNEW DELHI\tIND\t\t\t\t\t\t\t\tUSA\tWASHINGTON\tUSA\t\t\t\t\t\t\t\t0\t046\t046\t04\t1\t7.0\t3\t1\t3\t-1.70068027210885\t4\tNew Delhi, Delhi, India\tIN\tIN07\t17911\t28.6\t77.2\t-2106102\t3\tWashington, District of Columbia, United States\tUS\tUSDC\tDC001\t38.8951\t-77.0364\t531871\t3\tWashington, District of Columbia, United States\tUS\tUSDC\tDC001\t38.8951\t-77.0364\t531871\t20260813110000\thttps://www.business-standard.com/economy/news/centre-seeks-more-us-lpg-to-cut-reliance-on-west-asia-aid-trade-deal-126081301067_1.html";

    #[test]
    fn parses_a_real_export_row() {
        let event = parse_export_row(REAL_ROW).expect("real row must parse");

        assert_eq!(event.event_id, "1318092222");
        assert_eq!(event.event_date, "2025-08-13");
        assert_eq!(event.lat, 38.8951);
        assert_eq!(event.lon, -77.0364);
        assert_eq!(event.num_mentions, 3);
        assert_eq!(event.num_sources, 1);
        assert_eq!(event.quad_class, 1);
        assert_eq!(event.event_code, "046");
        assert!((event.tone - (-1.70068027210885)).abs() < 1e-9);
        assert_eq!(event.source_country, Some("US".to_string()));
        assert_eq!(event.domain, "www.business-standard.com");
        assert_eq!(event.title, "NEW DELHI \u{2192} WASHINGTON (verbal cooperation)");
        assert_eq!(event.image_url, None);
    }

    #[test]
    fn rejects_a_row_with_too_few_columns() {
        assert!(parse_export_row("1\t2\t3").is_none());
    }

    #[test]
    fn rejects_a_row_missing_actiongeo_coordinates() {
        // Same shape as REAL_ROW but with the ActionGeo lat/lon (cols 56/57)
        // blanked out, as GDELT does for events it can't geolocate.
        let cols: Vec<&str> = REAL_ROW.split('\t').collect();
        let mut cols = cols;
        cols[56] = "";
        cols[57] = "";
        let row = cols.join("\t");
        assert!(parse_export_row(&row).is_none());
    }

    #[test]
    fn anti_noise_filter_drops_low_mention_events() {
        let csv = "1\t20260813\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t0\t010\t010\t01\t1\t1.0\t9\t1\t9\t0.0\t4\t\t\t\t\t1.0\t2.0\t1\t0\t\t\t\t\t0.0\t0.0\t0\t4\t\t\t\t\t1.0\t2.0\t1\t20260813000000\thttp://example.com";
        assert!(parse_export_csv(csv).is_empty(), "NumMentions=9 should be filtered out (< 10)");
    }

    #[test]
    fn format_sqldate_inserts_iso_separators() {
        assert_eq!(format_sqldate("20260813"), "2026-08-13");
    }

    #[test]
    fn format_sqldate_passes_through_unexpected_length() {
        assert_eq!(format_sqldate("2026"), "2026");
    }

    #[test]
    fn synthesize_title_combines_both_actors() {
        assert_eq!(
            synthesize_title("FRANCE", "GERMANY", 2),
            "FRANCE \u{2192} GERMANY (material cooperation)"
        );
    }

    #[test]
    fn synthesize_title_falls_back_to_single_actor() {
        assert_eq!(synthesize_title("FRANCE", "", 4), "FRANCE (material conflict)");
    }

    #[test]
    fn synthesize_title_handles_no_actors() {
        assert_eq!(synthesize_title("", "", 9), "Unspecified actors (unclassified)");
    }

    #[test]
    fn domain_from_url_extracts_host() {
        assert_eq!(
            domain_from_url("https://www.example.com/a/b?c=1"),
            "www.example.com"
        );
    }

    #[test]
    fn domain_from_url_defaults_to_empty_on_garbage() {
        assert_eq!(domain_from_url("not a url"), "");
    }

    #[test]
    fn rewrites_listed_http_url_to_verified_https() {
        // Exact line shape observed live in `lastupdate.txt` on 2026-08-13.
        assert_eq!(
            to_verified_https_url(
                "http://data.gdeltproject.org/gdeltv2/20260813123000.export.CSV.zip"
            )
            .as_deref(),
            Some(
                "https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/20260813123000.export.CSV.zip"
            )
        );
    }

    #[test]
    fn rejects_export_url_on_foreign_host() {
        assert_eq!(
            to_verified_https_url("http://evil.example.com/gdeltv2/x.export.CSV.zip"),
            None
        );
        assert_eq!(to_verified_https_url("not a url"), None);
    }

    #[tokio::test]
    #[ignore = "diagnostic: hits the live GDELT network, run explicitly"]
    async fn diagnose_live_fetch() {
        let client = reqwest::Client::new();
        let url = fetch_latest_export_url(&client).await;
        eprintln!("DIAG lastupdate url result: {url:?}");
        let Ok(Some(csv_url)) = url else {
            panic!("no url resolved");
        };

        let response = client.get(&csv_url).timeout(REQUEST_TIMEOUT).send().await;
        let response = response.expect("request should succeed");
        eprintln!("DIAG status: {}", response.status());
        let bytes = response.bytes().await.expect("body should read");
        eprintln!("DIAG body bytes: {}", bytes.len());

        let csv_text = extract_first_file_from_zip(&bytes);
        eprintln!("DIAG zip extract ok: {}", csv_text.is_some());
        let csv_text = csv_text.expect("zip should extract");
        eprintln!("DIAG csv chars: {}", csv_text.len());
        eprintln!("DIAG csv lines: {}", csv_text.lines().count());

        let events = parse_export_csv(&csv_text);
        eprintln!("DIAG parsed+filtered events: {}", events.len());
    }
}
