use std::time::Duration;

use anyhow::Context;

use crate::types::FireHotspot;

const FIRMS_CSV_URL: &str = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);

// Header: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
// Index:  0        1         2          3    4     5        6        7         8          9       10        11  12

pub async fn fetch_fires(client: &reqwest::Client) -> anyhow::Result<Vec<FireHotspot>> {
    let text = client
        .get(FIRMS_CSV_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("FIRMS request failed")?
        .error_for_status()
        .context("FIRMS returned error status")?
        .text()
        .await
        .context("failed to read FIRMS response")?;

    let mut fires = Vec::new();
    let mut lines = text.lines();
    lines.next(); // skip header

    for line in lines {
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() < 13 {
            continue;
        }

        let lat: f64 = match cols[0].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let lon: f64 = match cols[1].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        fires.push(FireHotspot {
            lat,
            lon,
            brightness: cols[2].parse().unwrap_or(0.0),
            confidence: cols[8].to_string(),
            frp: cols[11].parse().unwrap_or(0.0),
            daynight: cols[12].to_string(),
            acq_date: cols[5].to_string(),
            acq_time: cols[6].to_string(),
            satellite: cols[7].to_string(),
        });
    }

    Ok(fires)
}
