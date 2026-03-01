use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::{AuroraPoint, SpaceWeatherAlert};

const AURORA_URL: &str = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL: &str = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const ALERTS_URL: &str = "https://services.swpc.noaa.gov/products/alerts.json";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Deserialize)]
struct OvationPoint {
    #[serde(alias = "Longitude")]
    longitude: f64,
    #[serde(alias = "Latitude")]
    latitude: f64,
    #[serde(alias = "Aurora")]
    aurora: u8,
}

pub async fn fetch_aurora(client: &reqwest::Client) -> anyhow::Result<Vec<AuroraPoint>> {
    let points: Vec<OvationPoint> = client
        .get(AURORA_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("aurora request failed")?
        .error_for_status()
        .context("aurora returned error")?
        .json()
        .await
        .context("failed to parse aurora response")?;

    let filtered: Vec<AuroraPoint> = points
        .into_iter()
        .filter(|p| p.aurora >= 10)
        .map(|p| AuroraPoint {
            lat: p.latitude,
            lon: if p.longitude > 180.0 {
                p.longitude - 360.0
            } else {
                p.longitude
            },
            probability: p.aurora,
        })
        .collect();

    Ok(filtered)
}

pub async fn fetch_kp_index(client: &reqwest::Client) -> anyhow::Result<f64> {
    let raw: Vec<Vec<String>> = client
        .get(KP_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("Kp index request failed")?
        .error_for_status()
        .context("Kp index returned error")?
        .json()
        .await
        .context("failed to parse Kp index response")?;

    // Last row, column index 1 = Kp value
    let kp = raw
        .last()
        .and_then(|row| row.get(1))
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(kp)
}

#[derive(Deserialize)]
struct RawAlert {
    product_id: Option<String>,
    issue_datetime: Option<String>,
    message: Option<String>,
}

pub async fn fetch_alerts(client: &reqwest::Client) -> anyhow::Result<Vec<SpaceWeatherAlert>> {
    let raw: Vec<RawAlert> = client
        .get(ALERTS_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("space weather alerts request failed")?
        .error_for_status()
        .context("space weather alerts returned error")?
        .json()
        .await
        .context("failed to parse space weather alerts")?;

    let alerts = raw
        .into_iter()
        .take(10)
        .filter_map(|a| {
            Some(SpaceWeatherAlert {
                product_id: a.product_id?,
                issue_time: a.issue_datetime.unwrap_or_default(),
                message: a.message.unwrap_or_default(),
            })
        })
        .collect();

    Ok(alerts)
}
