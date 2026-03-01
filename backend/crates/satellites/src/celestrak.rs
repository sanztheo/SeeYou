use std::time::Duration;

use anyhow::{Context, Result};

use crate::types::{SatelliteCategory, TleData};

const CELESTRAK_BASE: &str = "https://celestrak.org/NORAD/elements/gp.php";
const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

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
        anyhow::bail!("CelesTrak returned HTTP {status} for group {group}");
    }

    let text = resp.text().await?;
    Ok(parse_tle_text(&text, category))
}

/// Fetch all TLE groups concurrently, same pattern as `adsb::fetch_all_regions`.
/// Returns `(data, total_groups, failed_groups)`.
pub async fn fetch_all_tle(
    client: &reqwest::Client,
) -> (Vec<TleData>, usize, usize) {
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
