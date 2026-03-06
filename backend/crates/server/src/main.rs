mod app_state;
mod config;
mod error;

use std::time::Duration;

use axum::{routing::get, Router};
use serde::Serialize;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{info, warn};
use tracing_subscriber::{fmt, EnvFilter};

use app_state::AppState;
use config::Config;

const BROADCAST_CAPACITY: usize = 256;
const FIRE_BUS_CHUNK_SIZE: usize = 2_000;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;

    let redis_pool = cache::create_pool(&config.redis_url)?;
    info!(redis_url = %redact_url(&config.redis_url), "redis pool created");
    let pg_pool = try_create_pg_pool(config.database_url.as_deref()).await;
    let bus_settings = bus::BusSettings::from_env();
    let bus_producer = if bus_settings.enabled {
        match bus::BusProducer::new(
            &bus_settings.brokers,
            bus_settings.enabled,
            bus_settings.fallback_mode,
        ) {
            Ok(producer) => {
                info!(brokers = %bus_settings.brokers, "bus producer enabled");
                Some(producer)
            }
            Err(error) => {
                warn!(error = %error, "failed to create bus producer; using direct fallback mode");
                None
            }
        }
    } else {
        info!("bus disabled; using direct cache/postgres writes");
        None
    };

    let ws_broadcast = ws::Broadcaster::new(BROADCAST_CAPACITY);

    let http_client = reqwest::Client::new();
    let poll_interval = Duration::from_secs(config.poll_interval_secs);

    let camera_poll_interval = Duration::from_secs(config.camera_poll_interval_secs);

    tokio::spawn(services::aircraft_tracker::run_aircraft_tracker(
        http_client.clone(),
        redis_pool.clone(),
        pg_pool.clone(),
        bus_producer.clone(),
        ws_broadcast.clone(),
        poll_interval,
    ));

    tokio::spawn(cameras::tracker::run_camera_tracker(
        http_client.clone(),
        redis_pool.clone(),
        pg_pool.clone(),
        bus_producer.clone(),
        camera_poll_interval,
    ));

    let events_poll_interval = Duration::from_secs(config.events_poll_interval_secs);

    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let pg_pool = pg_pool.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match events::eonet::fetch_active_events(&client).await {
                    Ok(evts) => {
                        let resp = events::EventsResponse {
                            events: evts,
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let published = publish_json(
                            &bus_producer,
                            "server.events",
                            bus::topics::EVENTS,
                            &resp,
                        )
                        .await;

                        if let Err(e) = cache::events::set_events(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache events");
                        }

                        if !published {
                            if let Some(pg_pool) = &pg_pool {
                                let now = chrono::Utc::now();
                                let rows: Vec<db::models::EventRow> = resp
                                    .events
                                    .iter()
                                    .map(|evt| db::models::EventRow {
                                        observed_at: chrono::DateTime::parse_from_rfc3339(
                                            &evt.date,
                                        )
                                        .map(|dt| dt.with_timezone(&chrono::Utc))
                                        .unwrap_or(now),
                                        event_id: evt.id.clone(),
                                        event_type: format!("{:?}", evt.category),
                                        lat: evt.lat,
                                        lon: evt.lon,
                                        severity: event_severity(&evt.category),
                                        description: evt.title.clone(),
                                        source_url: evt.source_url.clone(),
                                    })
                                    .collect();

                                if let Err(e) = db::events::insert_events(pg_pool, &rows).await {
                                    tracing::warn!(error = %e, count = rows.len(), "failed to persist events");
                                }
                            }
                        }
                        tracing::info!(count = resp.events.len(), "natural events updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "events fetch failed"),
                }
                tokio::time::sleep(events_poll_interval).await;
            }
        }
    });

    let satellite_poll_interval = Duration::from_secs(config.satellite_poll_interval_secs);

    tokio::spawn(satellites::run_satellite_tracker(
        http_client.clone(),
        redis_pool.clone(),
        pg_pool.clone(),
        bus_producer.clone(),
        ws_broadcast.clone(),
        satellite_poll_interval,
    ));

    let metar_poll_interval = Duration::from_secs(config.metar_poll_interval_secs);

    tokio::spawn(services::metar_tracker::run_metar_tracker(
        http_client.clone(),
        redis_pool.clone(),
        pg_pool.clone(),
        bus_producer.clone(),
        ws_broadcast.clone(),
        metar_poll_interval,
    ));

    let weather_poll_interval = Duration::from_secs(config.weather_poll_interval_secs);

    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match weather::openmeteo::fetch_weather_grid(&client).await {
                    Ok(points) => {
                        let grid = weather::WeatherGrid {
                            points,
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published = publish_json(
                            &bus_producer,
                            "server.weather",
                            bus::topics::WEATHER,
                            &grid,
                        )
                        .await;
                        if let Err(e) = cache::weather::set_weather(&pool, &grid).await {
                            tracing::warn!(error = %e, "failed to cache weather");
                        }
                        tracing::info!(count = grid.points.len(), "weather grid updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "weather fetch failed"),
                }
                tokio::time::sleep(weather_poll_interval).await;
            }
        }
    });

    // --- New intelligence trackers ---

    let cables_poll_interval = Duration::from_secs(config.cables_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                let cables_result = cables::telegeography::fetch_cables(&client).await;
                let lp_result = cables::telegeography::fetch_landing_points(&client).await;
                match (cables_result, lp_result) {
                    (Ok(c), Ok(lp)) => {
                        let resp = cables::CablesResponse {
                            cables: c,
                            landing_points: lp,
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published = publish_json(
                            &bus_producer,
                            "server.cables",
                            bus::topics::CABLES,
                            &resp,
                        )
                        .await;
                        if let Err(e) = cache::cables::set_cables(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache cables");
                        }
                        tracing::info!(
                            cables = resp.cables.len(),
                            points = resp.landing_points.len(),
                            "submarine cables updated"
                        );
                    }
                    (Err(e), _) | (_, Err(e)) => tracing::warn!(error = %e, "cables fetch failed"),
                }
                tokio::time::sleep(cables_poll_interval).await;
            }
        }
    });

    let seismic_poll_interval = Duration::from_secs(config.seismic_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let broadcaster = ws_broadcast.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match seismic::usgs::fetch_earthquakes(&client).await {
                    Ok(quakes) => {
                        let resp = seismic::SeismicResponse {
                            earthquakes: quakes.clone(),
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published = publish_json(
                            &bus_producer,
                            "server.seismic",
                            bus::topics::SEISMIC,
                            &resp,
                        )
                        .await;
                        if let Err(e) = cache::seismic::set_seismic(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache seismic");
                        }
                        let ws_quakes: Vec<ws::messages::Earthquake> = quakes
                            .into_iter()
                            .map(|q| ws::messages::Earthquake {
                                id: q.id,
                                title: q.title,
                                magnitude: q.magnitude,
                                lat: q.lat,
                                lon: q.lon,
                                depth_km: q.depth_km,
                                time: q.time,
                                tsunami: q.tsunami,
                            })
                            .collect();
                        broadcaster.send(ws::WsMessage::SeismicUpdate {
                            earthquakes: ws_quakes,
                        });
                        tracing::info!(count = resp.earthquakes.len(), "seismic data updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "seismic fetch failed"),
                }
                tokio::time::sleep(seismic_poll_interval).await;
            }
        }
    });

    let fires_poll_interval = Duration::from_secs(config.fires_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let broadcaster = ws_broadcast.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match fires::firms::fetch_fires(&client).await {
                    Ok(hotspots) => {
                        let resp = fires::FiresResponse {
                            fires: hotspots.clone(),
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published = publish_fires_chunks(
                            &bus_producer,
                            "server.fires",
                            bus::topics::FIRES,
                            &resp.fires,
                            &resp.fetched_at,
                        )
                        .await;
                        if let Err(e) = cache::fires::set_fires(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache fires");
                        }
                        let ws_fires: Vec<ws::messages::FireHotspot> = hotspots
                            .into_iter()
                            .map(|f| ws::messages::FireHotspot {
                                lat: f.lat,
                                lon: f.lon,
                                brightness: f.brightness,
                                frp: f.frp,
                                confidence: f.confidence,
                            })
                            .collect();
                        broadcaster.send(ws::WsMessage::FireUpdate { fires: ws_fires });
                        tracing::info!(count = resp.fires.len(), "fire data updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "fires fetch failed"),
                }
                tokio::time::sleep(fires_poll_interval).await;
            }
        }
    });

    let gdelt_poll_interval = Duration::from_secs(config.gdelt_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let broadcaster = ws_broadcast.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match gdelt::api::fetch_events(&client).await {
                    Ok(events) => {
                        let resp = gdelt::GdeltResponse {
                            events: events.clone(),
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published =
                            publish_json(&bus_producer, "server.gdelt", bus::topics::GDELT, &resp)
                                .await;
                        if let Err(e) = cache::gdelt::set_gdelt(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache gdelt");
                        }
                        let ws_events: Vec<ws::messages::GdeltEvent> = events
                            .into_iter()
                            .map(|e| ws::messages::GdeltEvent {
                                title: e.title,
                                lat: e.lat,
                                lon: e.lon,
                                tone: e.tone,
                                domain: e.domain,
                                source_country: e.source_country,
                            })
                            .collect();
                        broadcaster.send(ws::WsMessage::GdeltUpdate { events: ws_events });
                        tracing::info!(count = resp.events.len(), "GDELT events updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "GDELT fetch failed"),
                }
                tokio::time::sleep(gdelt_poll_interval).await;
            }
        }
    });

    let maritime_poll_interval = Duration::from_secs(config.maritime_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let broadcaster = ws_broadcast.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match maritime::ais::fetch_vessels(&client).await {
                    Ok(vessels) => {
                        let resp = maritime::MaritimeResponse {
                            vessels: vessels.clone(),
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published = publish_json(
                            &bus_producer,
                            "server.maritime",
                            bus::topics::MARITIME,
                            &resp,
                        )
                        .await;
                        if let Err(e) = cache::maritime::set_maritime(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache maritime");
                        }
                        let ws_vessels: Vec<ws::messages::Vessel> = vessels
                            .into_iter()
                            .map(|v| ws::messages::Vessel {
                                mmsi: v.mmsi,
                                name: v.name,
                                vessel_type: v.vessel_type,
                                lat: v.lat,
                                lon: v.lon,
                                heading: v.heading,
                                is_sanctioned: v.is_sanctioned,
                            })
                            .collect();
                        broadcaster.send(ws::WsMessage::MaritimeUpdate {
                            vessels: ws_vessels,
                        });
                        tracing::info!(count = resp.vessels.len(), "maritime data updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "maritime fetch failed"),
                }
                tokio::time::sleep(maritime_poll_interval).await;
            }
        }
    });

    let cyber_poll_interval = Duration::from_secs(config.cyber_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let broadcaster = ws_broadcast.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                match cyber::threatfox::fetch_threats(&client).await {
                    Ok(threats) => {
                        let resp = cyber::CyberResponse {
                            threats: threats.clone(),
                            fetched_at: chrono::Utc::now().to_rfc3339(),
                        };
                        let _published =
                            publish_json(&bus_producer, "server.cyber", bus::topics::CYBER, &resp)
                                .await;
                        if let Err(e) = cache::cyber::set_cyber(&pool, &resp).await {
                            tracing::warn!(error = %e, "failed to cache cyber");
                        }
                        let ws_threats: Vec<ws::messages::CyberThreat> = threats
                            .into_iter()
                            .map(|t| ws::messages::CyberThreat {
                                id: t.id,
                                threat_type: t.threat_type,
                                src_lat: t.src_lat,
                                src_lon: t.src_lon,
                                src_country: t.src_country,
                                dst_lat: t.dst_lat,
                                dst_lon: t.dst_lon,
                                confidence: t.confidence,
                            })
                            .collect();
                        broadcaster.send(ws::WsMessage::CyberThreatUpdate {
                            threats: ws_threats,
                        });
                        tracing::info!(count = resp.threats.len(), "cyber threats updated");
                    }
                    Err(e) => tracing::warn!(error = %e, "cyber fetch failed"),
                }
                tokio::time::sleep(cyber_poll_interval).await;
            }
        }
    });

    let space_weather_poll_interval = Duration::from_secs(config.space_weather_poll_interval_secs);
    tokio::spawn({
        let client = http_client.clone();
        let pool = redis_pool.clone();
        let broadcaster = ws_broadcast.clone();
        let bus_producer = bus_producer.clone();
        async move {
            loop {
                let aurora_res = space_weather::noaa::fetch_aurora(&client).await;
                let kp_res = space_weather::noaa::fetch_kp_index(&client).await;
                let alerts_res = space_weather::noaa::fetch_alerts(&client).await;

                let aurora = aurora_res.unwrap_or_default();
                let kp = kp_res.unwrap_or(0.0);
                let alerts = alerts_res.unwrap_or_default();

                let resp = space_weather::SpaceWeatherResponse {
                    aurora: aurora.clone(),
                    kp_index: kp,
                    alerts: alerts.clone(),
                    fetched_at: chrono::Utc::now().to_rfc3339(),
                };
                let _published = publish_json(
                    &bus_producer,
                    "server.space_weather",
                    bus::topics::SPACE_WEATHER,
                    &resp,
                )
                .await;
                if let Err(e) = cache::space_weather::set_space_weather(&pool, &resp).await {
                    tracing::warn!(error = %e, "failed to cache space weather");
                }
                let ws_aurora: Vec<ws::messages::AuroraPoint> = aurora
                    .into_iter()
                    .map(|a| ws::messages::AuroraPoint {
                        lat: a.lat,
                        lon: a.lon,
                        probability: a.probability,
                    })
                    .collect();
                let ws_alerts: Vec<ws::messages::SpaceWeatherAlert> = alerts
                    .into_iter()
                    .map(|a| ws::messages::SpaceWeatherAlert {
                        product_id: a.product_id,
                        issue_time: a.issue_time,
                        message: a.message,
                    })
                    .collect();
                broadcaster.send(ws::WsMessage::SpaceWeatherUpdate {
                    aurora: ws_aurora,
                    kp_index: kp,
                    alerts: ws_alerts,
                });
                tracing::info!(
                    aurora_points = resp.aurora.len(),
                    kp_index = kp,
                    "space weather updated"
                );

                tokio::time::sleep(space_weather_poll_interval).await;
            }
        }
    });

    if let Some(producer) = bus_producer.clone() {
        tokio::spawn(async move {
            loop {
                let military: serde_json::Value =
                    serde_json::from_str(include_str!("../../../data/military_bases.json"))
                        .unwrap_or_else(|_| serde_json::json!([]));

                let nuclear: serde_json::Value =
                    serde_json::from_str(include_str!("../../../data/nuclear_sites.json"))
                        .unwrap_or_else(|_| serde_json::json!([]));

                let _ = publish_json(
                    &Some(producer.clone()),
                    "server.static.military_bases",
                    bus::topics::MILITARY_BASES,
                    &military,
                )
                .await;

                let _ = publish_json(
                    &Some(producer.clone()),
                    "server.static.nuclear_sites",
                    bus::topics::NUCLEAR_SITES,
                    &nuclear,
                )
                .await;

                tokio::time::sleep(Duration::from_secs(3600)).await;
            }
        });
    }

    let state = AppState {
        redis_pool,
        pg_pool,
        bus_producer,
        ws_broadcast,
        http_client,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(api::router())
        .route("/ws", get(ws::ws_handler))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(address = %addr, "server listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn publish_json<T: Serialize>(
    producer: &Option<bus::BusProducer>,
    source: &str,
    topic: &str,
    payload: &T,
) -> bool {
    let Some(producer) = producer else {
        return false;
    };

    match bus::BusEnvelope::new_json("1", source, topic, payload) {
        Ok(envelope) => match producer.send_envelope(&envelope).await {
            Ok(()) => true,
            Err(error) => {
                warn!(error = ?error, source, topic, "failed to publish bus envelope");
                false
            }
        },
        Err(error) => {
            warn!(error = %error, source, topic, "failed to build bus envelope");
            false
        }
    }
}

async fn publish_fires_chunks(
    producer: &Option<bus::BusProducer>,
    source: &str,
    topic: &str,
    fires: &[fires::FireHotspot],
    fetched_at: &str,
) -> bool {
    let Some(producer) = producer else {
        return false;
    };

    if fires.is_empty() {
        let payload = fires::FiresResponse {
            fires: Vec::new(),
            fetched_at: fetched_at.to_string(),
        };
        return publish_json(&Some(producer.clone()), source, topic, &payload).await;
    }

    let total_chunks = fires.len().max(1).div_ceil(FIRE_BUS_CHUNK_SIZE);
    let chunk_id = bus::new_chunk_id();

    for (chunk_index, chunk) in fires.chunks(FIRE_BUS_CHUNK_SIZE.max(1)).enumerate() {
        let chunk_source = if total_chunks > 1 {
            bus::format_chunked_source(
                source,
                &bus::BusChunkInfo::new(chunk_id.clone(), chunk_index, total_chunks),
            )
        } else {
            source.to_string()
        };
        let payload = fires::FiresResponse {
            fires: chunk.to_vec(),
            fetched_at: fetched_at.to_string(),
        };

        let envelope = match bus::BusEnvelope::new_json("1", chunk_source, topic, &payload) {
            Ok(envelope) => envelope,
            Err(error) => {
                warn!(error = %error, source, topic, "failed to build bus envelope");
                return false;
            }
        };

        let key = if total_chunks > 1 {
            chunk_id.as_str()
        } else {
            envelope.event_id.as_str()
        };

        if let Err(error) = producer.send_envelope_with_key(&envelope, key).await {
            warn!(error = ?error, source, topic, "failed to publish bus envelope");
            return false;
        }
    }

    true
}

async fn try_create_pg_pool(database_url: Option<&str>) -> Option<db::PgPool> {
    let Some(database_url) = database_url else {
        warn!("DATABASE_URL not set; postgres persistence disabled");
        return None;
    };

    match db::create_pool(database_url).await {
        Ok(pool) => {
            info!(database_url = %redact_url(database_url), "postgres pool created");

            if let Err(error) = db::run_migrations(&pool).await {
                warn!(error = %error, "postgres migrations failed; persistence disabled");
                return None;
            }

            info!("postgres migrations applied");
            Some(pool)
        }
        Err(error) => {
            warn!(error = %error, "failed to create postgres pool; persistence disabled");
            None
        }
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

fn redact_url(raw: &str) -> String {
    match url::Url::parse(raw) {
        Ok(mut u) => {
            if !u.username().is_empty() || u.password().is_some() {
                let _ = u.set_username("***");
                let _ = u.set_password(None);
            }
            u.to_string()
        }
        Err(_) => "***".to_string(),
    }
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to listen for ctrl-c");
    info!("shutdown signal received");
}
