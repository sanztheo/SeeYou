use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use tracing::{debug, error, warn};

use cache::RedisPool;

use std::sync::OnceLock;

fn tomtom_api_key() -> Option<&'static str> {
    static KEY: OnceLock<Option<String>> = OnceLock::new();
    KEY.get_or_init(|| std::env::var("TOMTOM_API_KEY").ok())
        .as_deref()
}

// ---------------------------------------------------------------------------
// GET /traffic/tiles-url
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TilesUrlResponse {
    pub flow_url: String,
    pub incidents_url: String,
}

pub async fn get_tiles_url() -> Result<Json<TilesUrlResponse>, StatusCode> {
    let key = tomtom_api_key().ok_or_else(|| {
        warn!("TOMTOM_API_KEY not set");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    Ok(Json(TilesUrlResponse {
        flow_url: format!(
            "https://api.tomtom.com/traffic/map/4/tile/flow/relative/{{z}}/{{x}}/{{y}}.png?key={key}&thickness=10&tileSize=512"
        ),
        incidents_url: format!(
            "https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{{z}}/{{x}}/{{y}}.png?key={key}&tileSize=512"
        ),
    }))
}

// ---------------------------------------------------------------------------
// GET /traffic/flow?south=&west=&north=&east=
// ---------------------------------------------------------------------------

const MAX_BBOX_AREA: f64 = 25.0;

#[derive(Debug, Deserialize)]
pub struct BboxQuery {
    pub south: f64,
    pub west: f64,
    pub north: f64,
    pub east: f64,
}

fn validate_bbox(q: &BboxQuery) -> Result<(), StatusCode> {
    if q.south.is_nan() || q.north.is_nan() || q.west.is_nan() || q.east.is_nan() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if q.south > q.north
        || q.west > q.east
        || q.south < -90.0
        || q.north > 90.0
        || q.west < -180.0
        || q.east > 180.0
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let area = (q.north - q.south) * (q.east - q.west);
    if area > MAX_BBOX_AREA {
        warn!(area, "bbox too large for traffic request");
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowSegment {
    pub coordinates: Vec<[f64; 2]>,
    pub current_speed: f64,
    pub free_flow_speed: f64,
    pub current_travel_time: f64,
    pub free_flow_travel_time: f64,
    pub confidence: f64,
    pub road_closure: bool,
}

#[derive(Serialize)]
pub struct FlowResponse {
    pub segments: Vec<FlowSegment>,
}

pub async fn get_flow(
    State(pool): State<RedisPool>,
    State(pg_pool): State<Option<db::PgPool>>,
    State(bus_producer): State<Option<bus::BusProducer>>,
    Query(q): Query<BboxQuery>,
) -> Result<Json<FlowResponse>, StatusCode> {
    validate_bbox(&q)?;

    let key = tomtom_api_key().ok_or_else(|| {
        warn!("TOMTOM_API_KEY not set");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let cache_key = format!(
        "tomtom:flow:{:.2}:{:.2}:{:.2}:{:.2}",
        q.south, q.west, q.north, q.east
    );
    if let Ok(Some(cached)) =
        cache::traffic::get_cached::<Vec<FlowSegment>>(&pool, &cache_key).await
    {
        debug!(count = cached.len(), "serving flow segments from cache");
        return Ok(Json(FlowResponse { segments: cached }));
    }

    match fetch_flow_segments(key, &q).await {
        Ok(segments) => {
            if let Err(e) = cache::traffic::set_cached(&pool, &cache_key, &segments, 120).await {
                error!(error = %e, "failed to cache flow segments");
            }

            let mut published = false;
            if let Some(producer) = &bus_producer {
                match bus::BusEnvelope::new_json(
                    "1",
                    "api.tomtom.flow",
                    bus::topics::TRAFFIC,
                    &FlowResponse {
                        segments: segments.clone(),
                    },
                ) {
                    Ok(envelope) => match producer.send_envelope(&envelope).await {
                        Ok(()) => {
                            published = true;
                        }
                        Err(e) => {
                            warn!(
                                error = ?e,
                                topic = bus::topics::TRAFFIC,
                                segments = segments.len(),
                                "failed to publish traffic to bus"
                            );
                        }
                    },
                    Err(e) => warn!(error = %e, "failed to build traffic bus envelope"),
                }
            }

            if !published {
                if let Some(pg_pool) = &pg_pool {
                    let rows = flow_segments_to_rows(&segments);
                    if let Err(e) = db::traffic::insert_segments(pg_pool, &rows).await {
                        warn!(error = %e, count = rows.len(), "failed to persist traffic flow segments");
                    }
                }
            } else {
                debug!("traffic flow published to bus topic");
            }

            debug!(count = segments.len(), "fetched flow segments from TomTom");
            Ok(Json(FlowResponse { segments }))
        }
        Err(e) => {
            error!(error = %e, "TomTom flow request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

async fn fetch_flow_segments(api_key: &str, bbox: &BboxQuery) -> anyhow::Result<Vec<FlowSegment>> {
    let client = reqwest::Client::new();
    let mut segments = Vec::new();

    let num_points = 5;
    let lat_step = (bbox.north - bbox.south) / num_points as f64;
    let lon_step = (bbox.east - bbox.west) / num_points as f64;

    for i in 0..num_points {
        for j in 0..num_points {
            let lat = bbox.south + lat_step * (i as f64 + 0.5);
            let lon = bbox.west + lon_step * (j as f64 + 0.5);

            let url = format!(
                "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative/10/json?point={lat},{lon}&key={api_key}&unit=KMPH"
            );

            let resp = client
                .get(&url)
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await;

            let resp = match resp {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    debug!(status = %r.status(), "TomTom flow point returned non-200, skipping");
                    continue;
                }
                Err(e) => {
                    debug!(error = %e, "TomTom flow point request failed, skipping");
                    continue;
                }
            };

            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(seg) = parse_flow_segment(&json) {
                    segments.push(seg);
                }
            }
        }
    }

    Ok(segments)
}

fn parse_flow_segment(json: &serde_json::Value) -> Option<FlowSegment> {
    let data = json.get("flowSegmentData")?;
    let coords_obj = data.get("coordinates")?.get("coordinate")?;
    let coords: Vec<[f64; 2]> = coords_obj
        .as_array()?
        .iter()
        .filter_map(|c| Some([c.get("longitude")?.as_f64()?, c.get("latitude")?.as_f64()?]))
        .collect();

    if coords.len() < 2 {
        return None;
    }

    Some(FlowSegment {
        coordinates: coords,
        current_speed: data.get("currentSpeed")?.as_f64()?,
        free_flow_speed: data.get("freeFlowSpeed")?.as_f64()?,
        current_travel_time: data.get("currentTravelTime")?.as_f64().unwrap_or(0.0),
        free_flow_travel_time: data.get("freeFlowTravelTime")?.as_f64().unwrap_or(0.0),
        confidence: data.get("confidence")?.as_f64().unwrap_or(0.0),
        road_closure: data
            .get("roadClosure")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

fn flow_segments_to_rows(segments: &[FlowSegment]) -> Vec<db::models::TrafficSegmentRow> {
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

            Some(db::models::TrafficSegmentRow {
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

// ---------------------------------------------------------------------------
// GET /traffic/incidents?south=&west=&north=&east=
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficIncident {
    pub id: String,
    pub incident_type: String,
    pub severity: u8,
    pub from_street: String,
    pub to_street: String,
    pub description: String,
    pub delay_seconds: i64,
    pub length_meters: f64,
    pub start_point: [f64; 2],
    pub end_point: [f64; 2],
    pub road_name: String,
}

#[derive(Serialize)]
pub struct IncidentsResponse {
    pub incidents: Vec<TrafficIncident>,
}

pub async fn get_incidents(
    State(pool): State<RedisPool>,
    Query(q): Query<BboxQuery>,
) -> Result<Json<IncidentsResponse>, StatusCode> {
    validate_bbox(&q)?;

    let key = tomtom_api_key().ok_or_else(|| {
        warn!("TOMTOM_API_KEY not set");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let cache_key = format!(
        "tomtom:incidents:{:.2}:{:.2}:{:.2}:{:.2}",
        q.south, q.west, q.north, q.east
    );
    if let Ok(Some(cached)) =
        cache::traffic::get_cached::<Vec<TrafficIncident>>(&pool, &cache_key).await
    {
        debug!(count = cached.len(), "serving incidents from cache");
        return Ok(Json(IncidentsResponse { incidents: cached }));
    }

    match fetch_incidents(key, &q).await {
        Ok(incidents) => {
            if let Err(e) = cache::traffic::set_cached(&pool, &cache_key, &incidents, 60).await {
                error!(error = %e, "failed to cache incidents");
            }
            debug!(count = incidents.len(), "fetched incidents from TomTom");
            Ok(Json(IncidentsResponse { incidents }))
        }
        Err(e) => {
            error!(error = %e, "TomTom incidents request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

async fn fetch_incidents(api_key: &str, bbox: &BboxQuery) -> anyhow::Result<Vec<TrafficIncident>> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.tomtom.com/traffic/services/5/incidentDetails?key={api_key}&bbox={},{},{},{}&fields={{incidents{{type,geometry{{type,coordinates}},properties{{iconCategory,magnitudeOfDelay,events{{description,code}},startTime,endTime,from,to,length,delay,roadNumbers}}}}}}&language=en-US&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,14",
        bbox.south, bbox.west, bbox.north, bbox.east
    );

    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("TomTom incidents API returned {status}: {body}");
    }

    let json: serde_json::Value = resp.json().await?;
    let incidents = parse_incidents(&json);
    Ok(incidents)
}

fn parse_incidents(json: &serde_json::Value) -> Vec<TrafficIncident> {
    let mut result = Vec::new();
    let Some(incidents) = json.get("incidents").and_then(|v| v.as_array()) else {
        return result;
    };

    for (i, inc) in incidents.iter().enumerate() {
        let props = match inc.get("properties") {
            Some(p) => p,
            None => continue,
        };
        let geom = match inc.get("geometry") {
            Some(g) => g,
            None => continue,
        };

        let coords = geom
            .get("coordinates")
            .and_then(|c| c.as_array())
            .unwrap_or(&Vec::new())
            .clone();

        let (start_point, end_point) = if coords.len() >= 2 {
            let first = &coords[0];
            let last = &coords[coords.len() - 1];
            let start = parse_coord(first).unwrap_or([0.0, 0.0]);
            let end = parse_coord(last).unwrap_or([0.0, 0.0]);
            (start, end)
        } else if coords.len() == 1 {
            let pt = parse_coord(&coords[0]).unwrap_or([0.0, 0.0]);
            (pt, pt)
        } else {
            continue;
        };

        let icon_cat = props
            .get("iconCategory")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let incident_type = match icon_cat {
            0 => "Unknown",
            1 => "Accident",
            2 => "Fog",
            3 => "Dangerous Conditions",
            4 => "Rain",
            5 => "Ice",
            6 => "Jam",
            7 => "Lane Closed",
            8 => "Road Closed",
            9 => "Road Works",
            10 => "Wind",
            11 => "Flooding",
            14 => "Broken Down Vehicle",
            _ => "Other",
        };

        let description = props
            .get("events")
            .and_then(|e| e.as_array())
            .and_then(|arr| arr.first())
            .and_then(|ev| ev.get("description"))
            .and_then(|d| d.as_str())
            .unwrap_or("")
            .to_string();

        let severity = match props.get("magnitudeOfDelay").and_then(|v| v.as_u64()) {
            Some(0) => 0,
            Some(1) => 1,
            Some(2) => 2,
            Some(3) => 3,
            Some(4) => 4,
            _ => 0,
        };

        result.push(TrafficIncident {
            id: format!("inc_{i}"),
            incident_type: incident_type.to_string(),
            severity: severity as u8,
            from_street: props
                .get("from")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            to_street: props
                .get("to")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            description,
            delay_seconds: props.get("delay").and_then(|v| v.as_i64()).unwrap_or(0),
            length_meters: props.get("length").and_then(|v| v.as_f64()).unwrap_or(0.0),
            start_point,
            end_point,
            road_name: props
                .get("roadNumbers")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        });
    }

    result
}

fn parse_coord(val: &serde_json::Value) -> Option<[f64; 2]> {
    let arr = val.as_array()?;
    if arr.len() >= 2 {
        Some([arr[0].as_f64()?, arr[1].as_f64()?])
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// POST /traffic/route
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RouteRequest {
    pub origin: [f64; 2],
    pub destination: [f64; 2],
    pub alternatives: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutePoint {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteInstruction {
    pub distance_meters: f64,
    pub travel_time_seconds: f64,
    pub street: String,
    pub maneuver: String,
    pub point: RoutePoint,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteResult {
    pub points: Vec<RoutePoint>,
    pub distance_meters: f64,
    pub travel_time_seconds: f64,
    pub traffic_delay_seconds: f64,
    pub instructions: Vec<RouteInstruction>,
}

#[derive(Serialize)]
pub struct RouteResponse {
    pub routes: Vec<RouteResult>,
}

pub async fn post_route(Json(body): Json<RouteRequest>) -> Result<Json<RouteResponse>, StatusCode> {
    let key = tomtom_api_key().ok_or_else(|| {
        warn!("TOMTOM_API_KEY not set");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    match fetch_route(key, &body).await {
        Ok(routes) => {
            debug!(count = routes.len(), "fetched routes from TomTom");
            Ok(Json(RouteResponse { routes }))
        }
        Err(e) => {
            error!(error = %e, "TomTom routing request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

async fn fetch_route(api_key: &str, req: &RouteRequest) -> anyhow::Result<Vec<RouteResult>> {
    let client = reqwest::Client::new();
    let [origin_lat, origin_lon] = req.origin;
    let [dest_lat, dest_lon] = req.destination;
    let max_alternatives = if req.alternatives.unwrap_or(false) {
        2
    } else {
        0
    };

    let url = format!(
        "https://api.tomtom.com/routing/1/calculateRoute/{origin_lat},{origin_lon}:{dest_lat},{dest_lon}/json?key={api_key}&traffic=true&travelMode=car&routeType=fastest&maxAlternatives={max_alternatives}&instructionsType=text&language=en-US"
    );

    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("TomTom routing API returned {status}: {body}");
    }

    let json: serde_json::Value = resp.json().await?;
    let routes = parse_routes(&json);
    Ok(routes)
}

fn parse_routes(json: &serde_json::Value) -> Vec<RouteResult> {
    let mut results = Vec::new();
    let Some(routes) = json.get("routes").and_then(|v| v.as_array()) else {
        return results;
    };

    for route in routes {
        let summary = match route.get("summary") {
            Some(s) => s,
            None => continue,
        };

        let distance = summary
            .get("lengthInMeters")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let travel_time = summary
            .get("travelTimeInSeconds")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let traffic_delay = summary
            .get("trafficDelayInSeconds")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let mut points = Vec::new();
        if let Some(legs) = route.get("legs").and_then(|v| v.as_array()) {
            for leg in legs {
                if let Some(leg_points) = leg.get("points").and_then(|v| v.as_array()) {
                    for pt in leg_points {
                        if let (Some(lat), Some(lon)) = (
                            pt.get("latitude").and_then(|v| v.as_f64()),
                            pt.get("longitude").and_then(|v| v.as_f64()),
                        ) {
                            points.push(RoutePoint { lat, lon });
                        }
                    }
                }
            }
        }

        let mut instructions = Vec::new();
        if let Some(guidance) = route.get("guidance") {
            if let Some(instrs) = guidance.get("instructions").and_then(|v| v.as_array()) {
                for instr in instrs {
                    let point_obj = instr.get("point");
                    let pt = point_obj
                        .map(|p| RoutePoint {
                            lat: p.get("latitude").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            lon: p.get("longitude").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        })
                        .unwrap_or(RoutePoint { lat: 0.0, lon: 0.0 });

                    instructions.push(RouteInstruction {
                        distance_meters: instr
                            .get("routeOffsetInMeters")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0),
                        travel_time_seconds: instr
                            .get("travelTimeInSeconds")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0),
                        street: instr
                            .get("street")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        maneuver: instr
                            .get("maneuver")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        point: pt,
                    });
                }
            }
        }

        results.push(RouteResult {
            points,
            distance_meters: distance,
            travel_time_seconds: travel_time,
            traffic_delay_seconds: traffic_delay,
            instructions,
        });
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flow_severity_thresholds() {
        assert_eq!(flow_severity(0.95), 1);
        assert_eq!(flow_severity(0.6), 2);
        assert_eq!(flow_severity(0.2), 3);
    }

    #[test]
    fn flow_segment_id_is_stable() {
        let seg = FlowSegment {
            coordinates: vec![[2.3522, 48.8566], [2.3600, 48.8600]],
            current_speed: 30.0,
            free_flow_speed: 50.0,
            current_travel_time: 120.0,
            free_flow_travel_time: 60.0,
            confidence: 0.8,
            road_closure: false,
        };

        let a = flow_segment_id(&seg);
        let b = flow_segment_id(&seg);
        assert_eq!(a, b);
        assert_eq!(a.len(), 40);
    }

    #[test]
    fn flow_segments_to_rows_maps_first_coordinate() {
        let seg = FlowSegment {
            coordinates: vec![[10.0, 20.0], [11.0, 21.0]],
            current_speed: 40.0,
            free_flow_speed: 80.0,
            current_travel_time: 180.0,
            free_flow_travel_time: 60.0,
            confidence: 1.0,
            road_closure: false,
        };

        let rows = flow_segments_to_rows(&[seg]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].lon, 10.0);
        assert_eq!(rows[0].lat, 20.0);
        assert!((rows[0].speed_ratio - 0.5).abs() < f64::EPSILON);
        assert!((rows[0].delay_min - 2.0).abs() < f64::EPSILON);
    }
}
