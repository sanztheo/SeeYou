use anyhow::Context;
use bus::{topics, BusEnvelope};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use db::models::{
    AircraftPositionRow, CableLandingPointRow, CameraRow, CyberThreatRow, EventRow, FireHotspotRow,
    GdeltEventRow, MaritimeVesselRow, MilitaryBaseRow, NuclearSiteRow, SatellitePositionRow,
    SeismicEventRow, SpaceWeatherAlertRow, SpaceWeatherAuroraRow, SpaceWeatherSnapshotRow,
    SubmarineCableRow, TrafficSegmentRow, WeatherReadingRow,
};
use rdkafka::{
    consumer::{CommitMode, Consumer, StreamConsumer},
    message::{BorrowedMessage, Message},
};
use serde::Deserialize;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Deserialize)]
struct MilitaryBaseInput {
    name: String,
    country: Option<String>,
    branch: Option<String>,
    lat: f64,
    lon: f64,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum MilitaryBasesPayload {
    Wrapped {
        bases: Vec<MilitaryBaseInput>,
        fetched_at: Option<String>,
    },
    List(Vec<MilitaryBaseInput>),
}

#[derive(Debug, Clone, Deserialize)]
struct NuclearSiteInput {
    name: String,
    country: Option<String>,
    #[serde(rename = "type")]
    site_type: Option<String>,
    status: Option<String>,
    lat: f64,
    lon: f64,
    capacity_mw: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum NuclearSitesPayload {
    Wrapped {
        sites: Vec<NuclearSiteInput>,
        fetched_at: Option<String>,
    },
    List(Vec<NuclearSiteInput>),
}

#[derive(Debug, Deserialize)]
struct FlowSegment {
    coordinates: Vec<[f64; 2]>,
    current_speed: f64,
    free_flow_speed: f64,
    current_travel_time: f64,
    free_flow_travel_time: f64,
    confidence: f64,
    road_closure: bool,
}

#[derive(Debug, Deserialize)]
struct FlowResponse {
    segments: Vec<FlowSegment>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    let _runtime_log_guard =
        runtime_logging::init(env!("CARGO_PKG_NAME"), env!("CARGO_MANIFEST_DIR"))?;

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL is required")?;
    let broker = bus::resolve_brokers_from_env();
    let group_id =
        std::env::var("POSTGRES_CONSUMER_GROUP").unwrap_or_else(|_| "postgres-consumer".into());

    let pg_pool = db::create_pool(&database_url).await?;
    db::run_migrations(&pg_pool).await?;

    let mut config = rdkafka::ClientConfig::new();
    config
        .set("bootstrap.servers", &broker)
        .set("group.id", &group_id)
        .set("enable.partition.eof", "false")
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest");
    bus::apply_kafka_security_from_env(&mut config);

    let consumer: StreamConsumer = config
        .create()
        .context("failed to create postgres stream consumer")?;

    consumer.subscribe(&topics::ALL_TOPICS)?;

    info!(broker = %broker, group_id = %group_id, "consumer_postgres started");

    loop {
        let msg = match consumer.recv().await {
            Ok(msg) => msg,
            Err(error) => {
                warn!(error = %error, "failed to receive bus message");
                continue;
            }
        };

        if let Err(error) = process_message(&pg_pool, &msg).await {
            error!(topic = %msg.topic(), error = %error, "failed to persist bus message");
            continue;
        }

        if let Err(error) = consumer.commit_message(&msg, CommitMode::Async) {
            warn!(topic = %msg.topic(), error = %error, "failed to commit offset");
        }
    }
}

async fn process_message(pool: &db::PgPool, msg: &BorrowedMessage<'_>) -> anyhow::Result<()> {
    let topic = msg.topic();
    let payload = msg.payload().context("empty payload")?;
    let envelope = BusEnvelope::decode_from_slice(payload)?;

    match topic {
        topics::AIRCRAFT => {
            let data: Vec<services::aircraft::Aircraft> =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode aircraft payload")?;
            let observed_at = Utc::now();
            let rows: Vec<AircraftPositionRow> = data
                .into_iter()
                .map(|a| AircraftPositionRow {
                    observed_at,
                    icao: a.icao,
                    callsign: a.callsign,
                    lat: a.lat,
                    lon: a.lon,
                    altitude_m: a.altitude_m,
                    speed_ms: a.speed_ms,
                    heading_deg: a.heading,
                    vertical_rate_ms: Some(a.vertical_rate_ms),
                    on_ground: a.on_ground,
                    is_military: a.is_military,
                })
                .collect();
            db::aircraft::insert_positions(pool, &rows).await?;
        }
        topics::CAMERAS => {
            let data: Vec<cameras::Camera> = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode cameras payload")?;
            let last_seen = Utc::now();
            let rows: Vec<CameraRow> = data
                .into_iter()
                .map(|c| CameraRow {
                    id: c.id,
                    name: c.name,
                    lat: c.lat,
                    lon: c.lon,
                    stream_type: format!("{:?}", c.stream_type),
                    source: c.source,
                    is_online: c.is_online,
                    last_seen,
                    city: Some(c.city),
                    country: Some(c.country),
                })
                .collect();
            db::cameras::upsert_cameras(pool, &rows).await?;
        }
        topics::TRAFFIC => {
            let data: FlowResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode traffic payload")?;
            let rows = flow_segments_to_rows(&data.segments);
            db::traffic::insert_segments(pool, &rows).await?;
        }
        topics::WEATHER => {
            let data: weather::WeatherGrid = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode weather payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            let rows: Vec<WeatherReadingRow> = data
                .points
                .into_iter()
                .map(|p| WeatherReadingRow {
                    observed_at,
                    station_id: format!("grid:{:.4}:{:.4}", p.lat, p.lon),
                    city: None,
                    lat: p.lat,
                    lon: p.lon,
                    temp_c: Some(p.temperature_c),
                    wind_kt: Some(p.wind_speed_ms * 1.94384),
                    visibility_m: None,
                    conditions: None,
                })
                .collect();
            db::weather::insert_readings(pool, &rows).await?;
        }
        topics::METAR => {
            let data: Vec<ws::messages::MetarStation> =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode metar payload")?;
            let observed_at = Utc::now();
            let rows: Vec<WeatherReadingRow> = data
                .into_iter()
                .map(|s| WeatherReadingRow {
                    observed_at,
                    station_id: s.station_id,
                    city: None,
                    lat: s.lat,
                    lon: s.lon,
                    temp_c: s.temp_c,
                    wind_kt: s.wind_speed_kt.map(f64::from),
                    visibility_m: s.visibility_m,
                    conditions: Some(s.flight_category),
                })
                .collect();
            db::weather::insert_readings(pool, &rows).await?;
        }
        topics::SATELLITES => {
            let data: Vec<satellites::Satellite> =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode satellites payload")?;
            let observed_at = Utc::now();
            let rows: Vec<SatellitePositionRow> = data
                .into_iter()
                .map(|s| SatellitePositionRow {
                    observed_at,
                    norad_id: s.norad_id as i64,
                    name: s.name,
                    category: s.category.as_str().to_string(),
                    lat: s.lat,
                    lon: s.lon,
                    altitude_km: s.altitude_km,
                    velocity_km_s: s.velocity_km_s,
                })
                .collect();
            db::satellites::insert_positions(pool, &rows).await?;
        }
        topics::EVENTS => {
            let data: events::EventsResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode events payload")?;
            let now = Utc::now();
            let rows: Vec<EventRow> = data
                .events
                .into_iter()
                .map(|evt| EventRow {
                    observed_at: DateTime::parse_from_rfc3339(&evt.date)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or(now),
                    event_id: evt.id,
                    event_type: format!("{:?}", evt.category),
                    lat: evt.lat,
                    lon: evt.lon,
                    severity: event_severity(&evt.category),
                    description: evt.title,
                    source_url: evt.source_url,
                })
                .collect();
            db::events::insert_events(pool, &rows).await?;
        }
        topics::SEISMIC => {
            let data: seismic::SeismicResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode seismic payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            let rows: Vec<SeismicEventRow> = data
                .earthquakes
                .into_iter()
                .map(|q| SeismicEventRow {
                    observed_at,
                    earthquake_id: q.id,
                    title: q.title,
                    magnitude: q.magnitude,
                    lat: q.lat,
                    lon: q.lon,
                    depth_km: q.depth_km,
                    event_time: parse_rfc3339_opt(q.time.as_str()),
                    url: q.url,
                    felt: q.felt.map(|v| v as i32),
                    tsunami: q.tsunami,
                })
                .collect();
            db::seismic::insert_seismic_events(pool, &rows).await?;
        }
        topics::FIRES => {
            let data: fires::FiresResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode fires payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            let rows: Vec<FireHotspotRow> = data
                .fires
                .into_iter()
                .map(|f| FireHotspotRow {
                    observed_at,
                    fire_key: fire_key(&f),
                    lat: f.lat,
                    lon: f.lon,
                    brightness: f.brightness,
                    confidence: f.confidence,
                    frp: f.frp,
                    daynight: f.daynight,
                    acq_date: f.acq_date,
                    acq_time: f.acq_time,
                    satellite: f.satellite,
                })
                .collect();
            db::fires::insert_fire_hotspots(pool, &rows).await?;
        }
        topics::GDELT => {
            let data: gdelt::GdeltResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode gdelt payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            let rows: Vec<GdeltEventRow> = data
                .events
                .into_iter()
                .map(|e| {
                    let key = if e.url.is_empty() {
                        format!("{}:{:.4}:{:.4}", e.title, e.lat, e.lon)
                    } else {
                        e.url.clone()
                    };
                    GdeltEventRow {
                        observed_at,
                        event_key: key,
                        url: e.url,
                        title: e.title,
                        lat: e.lat,
                        lon: e.lon,
                        tone: e.tone,
                        domain: e.domain,
                        source_country: e.source_country,
                        image_url: e.image_url,
                    }
                })
                .collect();
            db::gdelt::insert_gdelt_events(pool, &rows).await?;
        }
        topics::MARITIME => {
            let data: maritime::MaritimeResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode maritime payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            let rows: Vec<MaritimeVesselRow> = data
                .vessels
                .into_iter()
                .map(|v| MaritimeVesselRow {
                    observed_at,
                    mmsi: v.mmsi,
                    name: v.name,
                    imo: v.imo,
                    vessel_type: v.vessel_type,
                    lat: v.lat,
                    lon: v.lon,
                    speed_knots: v.speed_knots,
                    heading: v.heading,
                    destination: v.destination,
                    flag: v.flag,
                    is_sanctioned: v.is_sanctioned,
                })
                .collect();
            db::maritime::insert_maritime_vessels(pool, &rows).await?;
        }
        topics::CYBER => {
            let data: cyber::CyberResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode cyber payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            let rows: Vec<CyberThreatRow> = data
                .threats
                .into_iter()
                .map(|t| {
                    let first_seen = t.first_seen.as_deref().and_then(parse_rfc3339_opt);
                    let threat_key = if t.id.is_empty() {
                        format!(
                            "{}:{}:{}",
                            t.src_ip,
                            t.threat_type,
                            t.first_seen.clone().unwrap_or_default()
                        )
                    } else {
                        t.id.clone()
                    };
                    CyberThreatRow {
                        observed_at,
                        threat_key,
                        threat_id: if t.id.is_empty() { None } else { Some(t.id) },
                        threat_type: t.threat_type,
                        malware: t.malware,
                        src_ip: t.src_ip,
                        src_lat: t.src_lat,
                        src_lon: t.src_lon,
                        src_country: t.src_country,
                        dst_ip: t.dst_ip,
                        dst_lat: t.dst_lat,
                        dst_lon: t.dst_lon,
                        dst_country: t.dst_country,
                        confidence: t.confidence as i16,
                        first_seen,
                    }
                })
                .collect();
            db::cyber::insert_cyber_threats(pool, &rows).await?;
        }
        topics::SPACE_WEATHER => {
            let data: space_weather::SpaceWeatherResponse =
                serde_json::from_slice(&envelope.payload_json)
                    .context("failed to decode space_weather payload")?;
            let observed_at = parse_rfc3339_or_now(Some(&data.fetched_at));
            db::space_weather::insert_snapshot(
                pool,
                &SpaceWeatherSnapshotRow {
                    observed_at,
                    kp_index: data.kp_index,
                },
            )
            .await?;

            let aurora_rows: Vec<SpaceWeatherAuroraRow> = data
                .aurora
                .into_iter()
                .map(|a| SpaceWeatherAuroraRow {
                    observed_at,
                    lat: a.lat,
                    lon: a.lon,
                    probability: a.probability as i16,
                })
                .collect();
            db::space_weather::insert_aurora_points(pool, &aurora_rows).await?;

            let alert_rows: Vec<SpaceWeatherAlertRow> = data
                .alerts
                .into_iter()
                .map(|a| SpaceWeatherAlertRow {
                    observed_at,
                    product_id: a.product_id,
                    issue_time: a.issue_time,
                    message: a.message,
                })
                .collect();
            db::space_weather::insert_alerts(pool, &alert_rows).await?;
        }
        topics::CABLES => {
            let data: cables::CablesResponse = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode cables payload")?;
            let updated_at = parse_rfc3339_or_now(Some(&data.fetched_at));

            let cable_rows: Vec<SubmarineCableRow> = data
                .cables
                .into_iter()
                .map(|c| SubmarineCableRow {
                    cable_id: if c.id.is_empty() {
                        c.name.clone()
                    } else {
                        c.id
                    },
                    name: c.name,
                    length_km: c.length_km,
                    owners: c.owners,
                    year: c.year,
                    coordinates_json: serde_json::to_string(&c.coordinates)
                        .unwrap_or_else(|_| "[]".to_string()),
                    updated_at,
                })
                .collect();
            db::cables::upsert_submarine_cables(pool, &cable_rows).await?;

            let landing_rows: Vec<CableLandingPointRow> = data
                .landing_points
                .into_iter()
                .map(|p| CableLandingPointRow {
                    landing_point_id: if p.id.is_empty() {
                        p.name.clone()
                    } else {
                        p.id
                    },
                    name: p.name,
                    lat: p.lat,
                    lon: p.lon,
                    country: p.country,
                    updated_at,
                })
                .collect();
            db::cables::upsert_landing_points(pool, &landing_rows).await?;
        }
        topics::MILITARY_BASES => {
            let payload: MilitaryBasesPayload = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode military_bases payload")?;
            let (bases, fetched_at) = match payload {
                MilitaryBasesPayload::Wrapped { bases, fetched_at } => (bases, fetched_at),
                MilitaryBasesPayload::List(bases) => (bases, None),
            };
            let updated_at = parse_rfc3339_or_now(fetched_at.as_deref());
            let rows: Vec<MilitaryBaseRow> = bases
                .into_iter()
                .map(|b| MilitaryBaseRow {
                    base_key: format!(
                        "{}:{}",
                        b.name.to_lowercase(),
                        b.country.as_deref().unwrap_or("").to_lowercase()
                    ),
                    name: b.name,
                    country: b.country,
                    branch: b.branch,
                    lat: b.lat,
                    lon: b.lon,
                    updated_at,
                })
                .collect();
            db::military_bases::upsert_military_bases(pool, &rows).await?;
        }
        topics::NUCLEAR_SITES => {
            let payload: NuclearSitesPayload = serde_json::from_slice(&envelope.payload_json)
                .context("failed to decode nuclear_sites payload")?;
            let (sites, fetched_at) = match payload {
                NuclearSitesPayload::Wrapped { sites, fetched_at } => (sites, fetched_at),
                NuclearSitesPayload::List(sites) => (sites, None),
            };
            let updated_at = parse_rfc3339_or_now(fetched_at.as_deref());
            let rows: Vec<NuclearSiteRow> = sites
                .into_iter()
                .map(|s| NuclearSiteRow {
                    site_key: format!(
                        "{}:{}",
                        s.name.to_lowercase(),
                        s.country.as_deref().unwrap_or("").to_lowercase()
                    ),
                    name: s.name,
                    country: s.country,
                    site_type: s.site_type,
                    status: s.status,
                    lat: s.lat,
                    lon: s.lon,
                    capacity_mw: s.capacity_mw,
                    updated_at,
                })
                .collect();
            db::nuclear_sites::upsert_nuclear_sites(pool, &rows).await?;
        }
        other => {
            warn!(topic = %other, "unsupported topic skipped");
        }
    }

    Ok(())
}

fn flow_segments_to_rows(segments: &[FlowSegment]) -> Vec<TrafficSegmentRow> {
    let observed_at = Utc::now();
    segments
        .iter()
        .filter_map(|seg| {
            let first = seg.coordinates.first()?;
            let speed_ratio = if seg.free_flow_speed > 0.0 {
                seg.current_speed / seg.free_flow_speed
            } else {
                1.0
            };
            let delay_sec = (seg.current_travel_time - seg.free_flow_travel_time).max(0.0);

            Some(TrafficSegmentRow {
                observed_at,
                segment_id: flow_segment_id(seg),
                road_name: None,
                lat: first[1],
                lon: first[0],
                speed_ratio,
                delay_min: delay_sec / 60.0,
                severity: flow_severity(speed_ratio),
            })
        })
        .collect()
}

fn flow_segment_id(seg: &FlowSegment) -> String {
    use sha1::{Digest, Sha1};

    let mut hasher = Sha1::new();
    for [lon, lat] in &seg.coordinates {
        hasher.update(format!("{lon:.5},{lat:.5};"));
    }
    hasher.update(format!(
        "{:.2}:{:.2}:{:.2}:{:.2}:{}",
        seg.current_speed,
        seg.free_flow_speed,
        seg.current_travel_time,
        seg.free_flow_travel_time,
        seg.road_closure
    ));
    format!("{:x}", hasher.finalize())
}

fn flow_severity(speed_ratio: f64) -> i16 {
    if speed_ratio > 0.8 {
        1
    } else if speed_ratio > 0.4 {
        2
    } else {
        3
    }
}

fn event_severity(category: &events::EventCategory) -> i16 {
    use events::EventCategory::*;
    match category {
        Wildfires | SevereStorms | Volcanoes | Earthquakes | Floods => 3,
        SeaAndLakeIce => 2,
        Other => 1,
    }
}

fn fire_key(f: &fires::FireHotspot) -> String {
    format!(
        "{:.4}:{:.4}:{}:{}:{}:{}",
        f.lat, f.lon, f.acq_date, f.acq_time, f.satellite, f.daynight
    )
}

fn parse_rfc3339_or_now(raw: Option<&str>) -> DateTime<Utc> {
    raw.and_then(parse_rfc3339_opt).unwrap_or_else(Utc::now)
}

fn parse_rfc3339_opt(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.with_timezone(&Utc))
        .ok()
        .or_else(|| parse_fire_datetime(raw))
}

fn parse_fire_datetime(raw: &str) -> Option<DateTime<Utc>> {
    let mut parts = raw.split_whitespace();
    let date = parts.next()?;
    let time = parts.next()?;
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let t = format!("{time:0>4}");
    let hour: u32 = t[0..2].parse().ok()?;
    let minute: u32 = t[2..4].parse().ok()?;
    let ndt = d.and_hms_opt(hour, minute, 0)?;
    Some(Utc.from_utc_datetime(&ndt))
}
