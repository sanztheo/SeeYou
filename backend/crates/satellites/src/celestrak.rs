use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use anyhow::{Context, Result};

use crate::types::{SatelliteCategory, TleData};

const CELESTRAK_BASE: &str = "https://celestrak.org/NORAD/elements/gp.php";
const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

/// Last successful payload per group. CelesTrak refreshes GP data every two
/// hours and answers 403 in between with "GP data has not updated since your
/// last successful download" -- that is a freshness check, not a rejection, so
/// the right response is to keep serving what we already have.
fn tle_cache() -> &'static Mutex<HashMap<String, Vec<TleData>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Vec<TleData>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// True when a non-success body is CelesTrak saying the data is unchanged.
fn is_unchanged_since_last_download(body: &str) -> bool {
    body.contains("has not updated since your last successful")
}

const TLE_GROUPS: &[(&str, SatelliteCategory)] = &[
    ("stations", SatelliteCategory::Station),
    ("starlink", SatelliteCategory::Starlink),
    ("military", SatelliteCategory::Military),
    ("weather", SatelliteCategory::Weather),
    ("navigation", SatelliteCategory::Navigation),
    ("active", SatelliteCategory::Other),
];

fn parse_norad_id(line1: &str) -> Result<u64> {
    line1
        .get(2..7)
        .ok_or_else(|| anyhow::anyhow!("TLE line1 too short for NORAD ID"))?
        .trim()
        .parse::<u64>()
        .context("invalid NORAD ID in TLE")
}

fn parse_tle_text(text: &str, category: SatelliteCategory) -> Vec<TleData> {
    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim_end())
        .filter(|l| !l.is_empty())
        .collect();

    let mut results = Vec::new();
    let mut i = 0;

    while i + 2 < lines.len() {
        let name_line = lines[i];
        let line1 = lines[i + 1];
        let line2 = lines[i + 2];

        if !line1.starts_with('1') || !line2.starts_with('2') {
            i += 1;
            continue;
        }

        if let Ok(norad_id) = parse_norad_id(line1) {
            results.push(TleData {
                norad_id,
                name: name_line.trim().to_string(),
                line1: line1.to_string(),
                line2: line2.to_string(),
                category,
            });
        }

        i += 3;
    }

    results
}

pub async fn fetch_tle_group(
    client: &reqwest::Client,
    group: &str,
    category: SatelliteCategory,
) -> Result<Vec<TleData>> {
    let url = format!("{CELESTRAK_BASE}?GROUP={group}&FORMAT=tle");
    let resp = client
        .get(&url)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .with_context(|| format!("HTTP request failed for TLE group {group}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        if is_unchanged_since_last_download(&body) {
            if let Some(cached) = tle_cache()
                .lock()
                .expect("TLE cache poisoned")
                .get(group)
                .cloned()
            {
                tracing::debug!(group, count = cached.len(), "TLE unchanged, serving cache");
                return Ok(cached);
            }
        }
        anyhow::bail!("CelesTrak returned HTTP {status} for group {group}");
    }

    let text = resp.text().await?;
    let tles = parse_tle_text(&text, category);
    tle_cache()
        .lock()
        .expect("TLE cache poisoned")
        .insert(group.to_string(), tles.clone());
    Ok(tles)
}

/// Fetch all TLE groups concurrently, same pattern as `adsb::fetch_all_regions`.
/// Returns `(data, total_groups, failed_groups)`.
pub async fn fetch_all_tle(client: &reqwest::Client) -> (Vec<TleData>, usize, usize) {
    let handles: Vec<_> = TLE_GROUPS
        .iter()
        .map(|&(group, category)| {
            let client = client.clone();
            tokio::spawn(async move {
                let result = fetch_tle_group(&client, group, category).await;
                (group, result)
            })
        })
        .collect();

    let total = handles.len();
    let mut failed = 0usize;
    let mut all_tle = Vec::new();

    for handle in handles {
        match handle.await {
            Ok((group, Ok(tles))) => {
                tracing::info!(group, count = tles.len(), "fetched TLE group");
                all_tle.extend(tles);
            }
            Ok((group, Err(e))) => {
                failed += 1;
                tracing::warn!(group, "TLE group fetch failed: {e}");
            }
            Err(e) => {
                failed += 1;
                tracing::error!("TLE fetch task panicked: {e}");
            }
        }
    }

    (all_tle, total, failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verbatim body CelesTrak returns with a 403 between refreshes.
    const UNCHANGED_BODY: &str = "GP data has not updated since your last successful\n\
                                  download of GROUP=active at 2026-08-13 10:37:06 UTC.\n\
                                  Data is updated once every 2 hours.";

    #[test]
    fn recognises_the_unchanged_data_response() {
        assert!(is_unchanged_since_last_download(UNCHANGED_BODY));
    }

    #[test]
    fn does_not_mistake_other_failures_for_unchanged_data() {
        assert!(!is_unchanged_since_last_download("Service Unavailable"));
        assert!(!is_unchanged_since_last_download("Invalid GROUP"));
        assert!(!is_unchanged_since_last_download(""));
    }

    #[test]
    fn every_requested_group_is_distinct() {
        let mut names: Vec<&str> = TLE_GROUPS.iter().map(|(g, _)| *g).collect();
        let before = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), before, "a TLE group is requested twice");
    }
}
