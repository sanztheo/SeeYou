use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;

use crate::types::{Camera, CameraViewSource, StreamType};
use crate::view::{clamp_fov_deg, default_fov_for_source, parse_heading_from_hint};

use super::CameraProvider;

const PARIS_URL: &str = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/cameras-de-circulation/records?limit=100";

pub struct GenericProvider;

#[derive(Debug, Deserialize)]
struct ParisRecord {
    #[serde(default)]
    nom: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    geo_point_2d: Option<ParisGeo>,
}

#[derive(Debug, Deserialize)]
struct ParisGeo {
    #[serde(default)]
    lat: f64,
    #[serde(default)]
    lon: f64,
}

#[derive(Debug, Deserialize)]
struct ParisResponse {
    #[serde(default)]
    results: Vec<ParisRecord>,
}

async fn fetch_paris(client: &reqwest::Client) -> Vec<Camera> {
    let resp = client
        .get(PARIS_URL)
        .header("User-Agent", "Mozilla/5.0 SeeYou/1.0")
        .timeout(Duration::from_secs(10))
        .send()
        .await;

    let body = match resp {
        Ok(r) => match r.json::<ParisResponse>().await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(error = %e, "Paris cameras parse failed");
                return Vec::new();
            }
        },
        Err(e) => {
            tracing::warn!(error = %e, "Paris cameras request failed");
            return Vec::new();
        }
    };

    body.results
        .into_iter()
        .filter_map(|r| {
            let geo = r.geo_point_2d?;
            if geo.lat.abs() < 0.01 || r.url.is_empty() {
                return None;
            }
            let source = "paris_opendata".to_string();
            let view_heading_deg = parse_heading_from_hint(&r.nom);
            Some(Camera {
                id: format!("paris-{:.5}-{:.5}", geo.lat, geo.lon),
                name: r.nom,
                lat: geo.lat,
                lon: geo.lon,
                city: "Paris".into(),
                country: "FR".into(),
                source: source.clone(),
                stream_url: r.url,
                stream_type: StreamType::ImageRefresh,
                is_online: true,
                view_heading_deg,
                view_fov_deg: Some(clamp_fov_deg(default_fov_for_source(&source))),
                view_heading_source: view_heading_deg.map(|_| CameraViewSource::Parsed),
                view_hint: None,
            })
        })
        .collect()
}

fn worldwide_cameras() -> Vec<Camera> {
    let cams: Vec<(&str, &str, &str, &str, f64, f64, &str, StreamType)> = vec![
        // Tokyo
        ("tokyo-shibuya", "Shibuya Crossing", "Tokyo", "JP", 35.6595, 139.7004, "https://www.youtube.com/embed/3q6JE-XNTC0", StreamType::Hls),
        ("tokyo-tower", "Tokyo Tower View", "Tokyo", "JP", 35.6586, 139.7454, "https://www.youtube.com/embed/bHZQfnHRB9o", StreamType::Hls),
        ("tokyo-shinjuku", "Shinjuku South Exit", "Tokyo", "JP", 35.6896, 139.7006, "https://www.youtube.com/embed/Mk73Ki3R0M8", StreamType::Hls),
        // Sydney
        ("sydney-harbour", "Sydney Harbour Bridge", "Sydney", "AU", -33.8523, 151.2108, "https://www.rms.nsw.gov.au/trafficreports/cameras/camera_images/harbourbridge.jpg", StreamType::ImageRefresh),
        ("sydney-m5", "M5 East Motorway", "Sydney", "AU", -33.9405, 151.1280, "https://www.rms.nsw.gov.au/trafficreports/cameras/camera_images/m5east.jpg", StreamType::ImageRefresh),
        ("sydney-anzac", "Anzac Bridge", "Sydney", "AU", -33.8710, 151.1850, "https://www.rms.nsw.gov.au/trafficreports/cameras/camera_images/anzacbridge.jpg", StreamType::ImageRefresh),
        // Seoul
        ("seoul-gangnam", "Gangnam Station", "Seoul", "KR", 37.4979, 127.0276, "http://210.179.218.52:1935/live/131.stream/playlist.m3u8", StreamType::Hls),
        ("seoul-hongdae", "Hongdae Area", "Seoul", "KR", 37.5563, 126.9236, "http://210.179.218.52:1935/live/148.stream/playlist.m3u8", StreamType::Hls),
        // Amsterdam
        ("ams-a10-south", "A10 Ring South", "Amsterdam", "NL", 52.3388, 4.8925, "https://webcam.a10ringsouth.nl/cam1.jpg", StreamType::ImageRefresh),
        ("ams-dam-square", "Dam Square", "Amsterdam", "NL", 52.3731, 4.8932, "https://www.youtube.com/embed/ggvLyn7YPeA", StreamType::Hls),
        // Berlin
        ("berlin-brandenburg", "Brandenburg Gate", "Berlin", "DE", 52.5163, 13.3777, "https://www.youtube.com/embed/YRvfYCAwnWg", StreamType::Hls),
        ("berlin-alex", "Alexanderplatz", "Berlin", "DE", 52.5219, 13.4132, "https://www.youtube.com/embed/xOBeVXNtiNE", StreamType::Hls),
        // Rome
        ("rome-colosseum", "Colosseum View", "Rome", "IT", 41.8902, 12.4922, "https://www.youtube.com/embed/TkWLNLmSvYM", StreamType::Hls),
        ("rome-trevi", "Trevi Fountain", "Rome", "IT", 41.9009, 12.4833, "https://www.youtube.com/embed/K3M6JCpdTcA", StreamType::Hls),
        // Bangkok
        ("bkk-siam", "Siam Square", "Bangkok", "TH", 13.7456, 100.5332, "https://www.youtube.com/embed/4cHREwjmPi8", StreamType::Hls),
        ("bkk-sukhumvit", "Sukhumvit Road", "Bangkok", "TH", 13.7372, 100.5601, "https://www.youtube.com/embed/xV11b6tTd0o", StreamType::Hls),
        // Singapore
        ("sg-mbs", "Marina Bay Sands", "Singapore", "SG", 1.2839, 103.8607, "https://www.youtube.com/embed/Oc6shXvnMOc", StreamType::Hls),
        // Dubai
        ("dubai-burj", "Burj Khalifa", "Dubai", "AE", 25.1972, 55.2744, "https://www.youtube.com/embed/83x5-pNQmSo", StreamType::Hls),
        // Hong Kong
        ("hk-victoria", "Victoria Harbour", "Hong Kong", "HK", 22.2930, 114.1694, "https://www.youtube.com/embed/WxB1gB6K-2A", StreamType::Hls),
        // Toronto
        ("tor-cn-tower", "CN Tower View", "Toronto", "CA", 43.6426, -79.3871, "https://www.youtube.com/embed/kMW0QLrBrjo", StreamType::Hls),
        ("tor-dundas", "Dundas Square", "Toronto", "CA", 43.6561, -79.3802, "https://www.youtube.com/embed/YDYNnguU8WU", StreamType::Hls),
        // Rio
        ("rio-copacabana", "Copacabana Beach", "Rio de Janeiro", "BR", -22.9714, -43.1822, "https://www.youtube.com/embed/0KY1HEFC8Hs", StreamType::Hls),
        // Moscow
        ("moscow-red-sq", "Red Square", "Moscow", "RU", 55.7539, 37.6208, "https://www.youtube.com/embed/IZEBMDup2TQ", StreamType::Hls),
        // Istanbul
        ("istanbul-hagia", "Hagia Sophia View", "Istanbul", "TR", 41.0086, 28.9802, "https://www.youtube.com/embed/V7a0HwMEkJM", StreamType::Hls),
        // Barcelona
        ("bcn-sagrada", "Sagrada Familia", "Barcelona", "ES", 41.4036, 2.1744, "https://www.youtube.com/embed/WZZoCDAX5u0", StreamType::Hls),
        // Prague
        ("prague-old-town", "Old Town Square", "Prague", "CZ", 50.0870, 14.4210, "https://www.youtube.com/embed/3WdoOm0rBZo", StreamType::Hls),
        // Buenos Aires
        ("bsas-obelisco", "Obelisco", "Buenos Aires", "AR", -34.6037, -58.3816, "https://www.youtube.com/embed/GbLxYhFDiyA", StreamType::Hls),
        // Nairobi
        ("nairobi-cbd", "Nairobi CBD", "Nairobi", "KE", -1.2864, 36.8172, "https://www.youtube.com/embed/HL4FZhkFDCE", StreamType::Hls),
        // Cape Town
        ("cape-table-mt", "Table Mountain", "Cape Town", "ZA", -33.9628, 18.4098, "https://www.youtube.com/embed/XHm3FQXvyRQ", StreamType::Hls),
        // Mumbai
        ("mumbai-marine", "Marine Drive", "Mumbai", "IN", 18.9432, 72.8235, "https://www.youtube.com/embed/kMbPYHF0cj0", StreamType::Hls),
    ];

    cams.into_iter()
        .map(|(id, name, city, country, lat, lon, url, st)| {
            let source = "generic".to_string();
            let view_heading_deg = parse_heading_from_hint(name);
            Camera {
                id: id.to_string(),
                name: name.to_string(),
                lat,
                lon,
                city: city.to_string(),
                country: country.to_string(),
                source: source.clone(),
                stream_url: url.to_string(),
                stream_type: st,
                is_online: true,
                view_heading_deg,
                view_fov_deg: Some(clamp_fov_deg(default_fov_for_source(&source))),
                view_heading_source: view_heading_deg.map(|_| CameraViewSource::Parsed),
                view_hint: None,
            }
        })
        .collect()
}

#[async_trait]
impl CameraProvider for GenericProvider {
    async fn fetch_cameras(&self, client: &reqwest::Client) -> Result<Vec<Camera>> {
        let paris = fetch_paris(client).await;
        let worldwide = worldwide_cameras();

        let mut all = Vec::with_capacity(paris.len() + worldwide.len());
        all.extend(paris);
        all.extend(worldwide);

        tracing::info!(count = all.len(), "generic provider cameras");
        Ok(all)
    }

    fn source_name(&self) -> &'static str {
        "generic"
    }
}
