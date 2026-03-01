use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

use crate::types::CyberThreat;

const THREATFOX_URL: &str = "https://threatfox-api.abuse.ch/api/v1/";
const IP_GEO_URL: &str = "http://ip-api.com/batch";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct ThreatFoxResponse {
    data: Option<Vec<ThreatFoxIoc>>,
}

#[derive(Deserialize)]
struct ThreatFoxIoc {
    id: Option<String>,
    ioc_type: Option<String>,
    ioc: Option<String>,
    threat_type: Option<String>,
    malware: Option<String>,
    confidence_level: Option<u8>,
    first_seen: Option<String>,
}

#[derive(Deserialize)]
struct IpGeoResult {
    query: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    country: Option<String>,
    status: Option<String>,
}

pub async fn fetch_threats(client: &reqwest::Client) -> anyhow::Result<Vec<CyberThreat>> {
    let body = serde_json::json!({"query": "get_iocs", "days": 1});

    let resp: ThreatFoxResponse = client
        .post(THREATFOX_URL)
        .json(&body)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .context("ThreatFox request failed")?
        .json()
        .await
        .context("failed to parse ThreatFox response")?;

    let iocs = resp.data.unwrap_or_default();

    let ips: Vec<String> = iocs
        .iter()
        .filter_map(|ioc| {
            let val = ioc.ioc.as_deref()?;
            let ip = val.split(':').next()?;
            if ip.parse::<std::net::IpAddr>().is_ok() {
                Some(ip.to_string())
            } else {
                None
            }
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .take(45) // ip-api.com free batch limit
        .collect();

    let geo_map = if !ips.is_empty() {
        geolocate_ips(client, &ips).await.unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let threats = iocs
        .into_iter()
        .filter_map(|ioc| {
            let raw = ioc.ioc.as_deref()?;
            let ip = raw.split(':').next()?.to_string();
            let geo = geo_map.get(&ip)?;

            Some(CyberThreat {
                id: ioc.id.unwrap_or_default(),
                threat_type: ioc.threat_type.unwrap_or_else(|| "unknown".to_string()),
                malware: ioc.malware,
                src_ip: ip,
                src_lat: geo.0,
                src_lon: geo.1,
                src_country: geo.2.clone(),
                dst_ip: None,
                dst_lat: None,
                dst_lon: None,
                dst_country: None,
                confidence: ioc.confidence_level.unwrap_or(50),
                first_seen: ioc.first_seen,
            })
        })
        .collect();

    Ok(threats)
}

async fn geolocate_ips(
    client: &reqwest::Client,
    ips: &[String],
) -> anyhow::Result<std::collections::HashMap<String, (f64, f64, Option<String>)>> {
    let batch: Vec<serde_json::Value> = ips
        .iter()
        .map(|ip| serde_json::json!({"query": ip}))
        .collect();

    let results: Vec<IpGeoResult> = client
        .post(IP_GEO_URL)
        .json(&batch)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .context("ip geolocation failed")?
        .json()
        .await
        .context("failed to parse geo response")?;

    let mut map = std::collections::HashMap::new();
    for r in results {
        if r.status.as_deref() == Some("success") {
            if let (Some(q), Some(lat), Some(lon)) = (&r.query, r.lat, r.lon) {
                map.insert(q.clone(), (lat, lon, r.country));
            }
        }
    }
    Ok(map)
}
