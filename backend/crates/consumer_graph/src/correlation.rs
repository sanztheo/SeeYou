//! Lot 4/5 cross-domain correlation engine (`docs/plans/seeyou-v2.md`
//! §"Architecture d'exécution").
//!
//! Replaces the old per-entity pattern (`graph_links.rs`'s
//! `link_aircraft_to_nearby_cameras`, one full `load_table_entities("camera")`
//! scan of ~11 020 rows *per admitted aircraft*) with:
//! - an in-memory accumulator per correlatable domain (`DomainStore`),
//!   upserted as entities stream in and expired on the domain's own cadence;
//! - an `rstar` R-tree per domain, rebuilt lazily (only when the store
//!   actually changed) instead of scanned linearly;
//! - a coarse-then-exact nearest-neighbor query (`nearest_within`) shared by
//!   every "X near Y" relation;
//! - batched, chunked `RELATE` writes (`GraphBusConsumer::flush_relation_edges`)
//!   with bounded concurrency, instead of one sequential `.await` per edge.
//!
//! Correlation itself stays event-driven: `run_correlation_pass` is called
//! once per bus envelope (`consumer.rs::handle_envelope`), never on an
//! independent timer — there is no clock here faster than the data.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use chrono::{SecondsFormat, Utc};
use futures_util::{stream, StreamExt};
use rstar::{PointDistance, RTree, RTreeObject, AABB};
use serde_json::{json, Value};
use tracing::info;

use crate::{
    consumer::{parse_env_f64, parse_env_i64, parse_env_usize, GraphBusConsumer},
    constants::{
        CAMERA_STORE_TTL_SECONDS, DEFAULT_AIRCRAFT_NEAR_BASE_RADIUS_KM,
        DEFAULT_AIRCRAFT_NEAR_BASE_TTL_SECONDS, DEFAULT_FIRE_MIN_FRP_MW,
        DEFAULT_FIRE_NEAR_RADIUS_KM, DEFAULT_FIRE_NEAR_TTL_SECONDS,
        DEFAULT_MONITORED_BY_MAX_ALTITUDE_M, DEFAULT_MONITORED_BY_TOP_K,
        DEFAULT_MONITORED_BY_TTL_SECONDS, DEFAULT_SEISMIC_MIN_MAGNITUDE,
        DEFAULT_SEISMIC_NEAR_RADIUS_KM, DEFAULT_SEISMIC_NEAR_TTL_SECONDS,
        LOW_VISIBILITY_THRESHOLD_M, MONITORED_BY_MAX_DISTANCE_KM, RELATE_BATCH_CHUNK_SIZE,
        RELATE_BATCH_CONCURRENCY, STATIC_DOMAIN_STORE_TTL_SECONDS,
    },
    geo::{extract_lat_lon, haversine_km},
};
use graph::relations::{relation_attributes, score_from_distance_km, RelationEdge};

/// A point stored in a domain's spatial index: record id + coordinates. The
/// envelope lives in plain degrees (cheap, no projection) — every candidate
/// the tree returns is re-checked with exact haversine in `nearest_within`,
/// so the tree only needs to be a superset filter, not exact itself.
#[derive(Debug, Clone)]
struct IndexedPoint {
    id: String,
    lat: f64,
    lon: f64,
}

impl RTreeObject for IndexedPoint {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_point([self.lon, self.lat])
    }
}

impl PointDistance for IndexedPoint {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        let dlon = self.lon - point[0];
        let dlat = self.lat - point[1];
        dlon * dlon + dlat * dlat
    }
}

/// Coarse R-tree scan (planar degrees) followed by an exact haversine
/// re-check, returning candidates within `max_km` sorted nearest-first and
/// capped at `top_k` (pass `usize::MAX` for "no cap", e.g. #5/#7 where the
/// target domain is tiny: military_base + nuclear_site total ~65 rows).
fn nearest_within(
    index: &RTree<IndexedPoint>,
    lat: f64,
    lon: f64,
    max_km: f64,
    top_k: usize,
) -> Vec<(String, f64)> {
    if max_km <= 0.0 {
        return Vec::new();
    }

    // 1 degree of latitude is ~111 km; pad 1.5x so the coarse box is always
    // a strict superset of the exact haversine circle (longitude shrinks
    // faster than this near the poles, never the other way round).
    let coarse_deg_radius = (max_km / 111.0) * 1.5;
    let mut candidates: Vec<(String, f64)> = index
        .locate_within_distance([lon, lat], coarse_deg_radius * coarse_deg_radius)
        .filter_map(|point| {
            let distance_km = haversine_km(lat, lon, point.lat, point.lon);
            (distance_km <= max_km).then(|| (point.id.clone(), distance_km))
        })
        .collect();

    candidates.sort_by(|a, b| a.1.total_cmp(&b.1));
    candidates.truncate(top_k);
    candidates
}

struct StoredPoint {
    lat: f64,
    lon: f64,
    seen_at: Instant,
}

/// Per-domain in-memory accumulator + spatial index. Entities are upserted
/// as their topic's messages arrive; `ensure_fresh` drops anything not
/// refreshed within the domain's TTL and rebuilds the R-tree — but only
/// when something actually changed, so a call with nothing dirty and
/// nothing expired is a cheap no-op (not a rebuild every envelope).
struct DomainStore {
    points: HashMap<String, StoredPoint>,
    index: RTree<IndexedPoint>,
    dirty: bool,
    ttl: Duration,
}

impl DomainStore {
    fn new(ttl: Duration) -> Self {
        Self {
            points: HashMap::new(),
            index: RTree::new(),
            dirty: false,
            ttl,
        }
    }

    fn upsert(&mut self, id: String, lat: f64, lon: f64) {
        self.points.insert(
            id,
            StoredPoint {
                lat,
                lon,
                seen_at: Instant::now(),
            },
        );
        self.dirty = true;
    }

    fn ensure_fresh(&mut self) {
        let ttl = self.ttl;
        let before = self.points.len();
        self.points.retain(|_, point| point.seen_at.elapsed() <= ttl);
        if self.points.len() != before {
            self.dirty = true;
        }

        if self.dirty {
            self.index = RTree::bulk_load(
                self.points
                    .iter()
                    .map(|(id, point)| IndexedPoint {
                        id: id.clone(),
                        lat: point.lat,
                        lon: point.lon,
                    })
                    .collect(),
            );
            self.dirty = false;
        }
    }

    fn index(&self) -> &RTree<IndexedPoint> {
        &self.index
    }

    fn len(&self) -> usize {
        self.points.len()
    }
}

/// Anti-noise admission thresholds + TTLs for the Lot 5 cross-domain
/// relations (`docs/plans/seeyou-v2.md` §Anti-bruit) — every one overridable
/// via env so an operator can retune without a rebuild (the bench gate
/// explicitly anticipates lowering K/radii if write throughput falls short).
// `pub` (not `pub(crate)`): it appears in `GraphBusConsumer::new`'s public
// signature, so it must be nameable outside this crate even though nothing
// external constructs one directly (`from_env` stays `pub(crate)`).
#[derive(Debug, Clone)]
pub struct CorrelationThresholds {
    pub(crate) monitored_by_max_distance_km: f64,
    pub(crate) monitored_by_max_altitude_m: f64,
    pub(crate) monitored_by_top_k: usize,
    pub(crate) monitored_by_ttl_seconds: i64,
    pub(crate) aircraft_near_base_radius_km: f64,
    pub(crate) aircraft_near_base_ttl_seconds: i64,
    pub(crate) seismic_min_magnitude: f64,
    pub(crate) seismic_near_radius_km: f64,
    pub(crate) seismic_near_ttl_seconds: i64,
    pub(crate) fire_min_frp_mw: f64,
    pub(crate) fire_near_radius_km: f64,
    pub(crate) fire_near_ttl_seconds: i64,
    pub(crate) weather_low_visibility_threshold_m: f64,
}

impl CorrelationThresholds {
    pub(crate) fn from_env() -> Self {
        Self {
            monitored_by_max_distance_km: parse_env_f64(
                "GRAPH_MONITORED_BY_MAX_DISTANCE_KM",
                MONITORED_BY_MAX_DISTANCE_KM,
            ),
            monitored_by_max_altitude_m: parse_env_f64(
                "GRAPH_MONITORED_BY_MAX_ALTITUDE_M",
                DEFAULT_MONITORED_BY_MAX_ALTITUDE_M,
            ),
            monitored_by_top_k: parse_env_usize(
                "GRAPH_MONITORED_BY_TOP_K",
                DEFAULT_MONITORED_BY_TOP_K,
            ),
            monitored_by_ttl_seconds: parse_env_i64(
                "GRAPH_MONITORED_BY_TTL_SECONDS",
                DEFAULT_MONITORED_BY_TTL_SECONDS,
            ),
            aircraft_near_base_radius_km: parse_env_f64(
                "GRAPH_AIRCRAFT_NEAR_BASE_RADIUS_KM",
                DEFAULT_AIRCRAFT_NEAR_BASE_RADIUS_KM,
            ),
            aircraft_near_base_ttl_seconds: parse_env_i64(
                "GRAPH_AIRCRAFT_NEAR_BASE_TTL_SECONDS",
                DEFAULT_AIRCRAFT_NEAR_BASE_TTL_SECONDS,
            ),
            seismic_min_magnitude: parse_env_f64(
                "GRAPH_SEISMIC_MIN_MAGNITUDE",
                DEFAULT_SEISMIC_MIN_MAGNITUDE,
            ),
            seismic_near_radius_km: parse_env_f64(
                "GRAPH_SEISMIC_NEAR_RADIUS_KM",
                DEFAULT_SEISMIC_NEAR_RADIUS_KM,
            ),
            seismic_near_ttl_seconds: parse_env_i64(
                "GRAPH_SEISMIC_NEAR_TTL_SECONDS",
                DEFAULT_SEISMIC_NEAR_TTL_SECONDS,
            ),
            fire_min_frp_mw: parse_env_f64("GRAPH_FIRE_MIN_FRP_MW", DEFAULT_FIRE_MIN_FRP_MW),
            fire_near_radius_km: parse_env_f64(
                "GRAPH_FIRE_NEAR_RADIUS_KM",
                DEFAULT_FIRE_NEAR_RADIUS_KM,
            ),
            fire_near_ttl_seconds: parse_env_i64(
                "GRAPH_FIRE_NEAR_TTL_SECONDS",
                DEFAULT_FIRE_NEAR_TTL_SECONDS,
            ),
            weather_low_visibility_threshold_m: parse_env_f64(
                "GRAPH_LOW_VISIBILITY_THRESHOLD_M",
                LOW_VISIBILITY_THRESHOLD_M,
            ),
        }
    }
}

/// #7 admission: high confidence *and* FRP in the top slice of energy.
/// Thresholds measured against the local FIRMS ingest — see
/// `constants::DEFAULT_FIRE_MIN_FRP_MW`.
fn fire_admitted(payload: &Value, thresholds: &CorrelationThresholds) -> bool {
    let confidence_high = payload.get("confidence").and_then(Value::as_str) == Some("high");
    let frp_high = payload
        .get("frp")
        .and_then(Value::as_f64)
        .map(|frp| frp >= thresholds.fire_min_frp_mw)
        .unwrap_or(false);
    confidence_high && frp_high
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// Builds the `(timestamp, expires_at)` pair shared by every ephemeral
/// relation's attributes, `ttl_seconds` out from now.
pub(crate) fn relation_window(ttl_seconds: i64) -> (String, String) {
    let now = Utc::now();
    let timestamp = now.to_rfc3339_opts(SecondsFormat::Secs, true);
    let expires_at =
        (now + chrono::Duration::seconds(ttl_seconds)).to_rfc3339_opts(SecondsFormat::Secs, true);
    (timestamp, expires_at)
}

/// Holds the R-tree-backed domains that near/monitored_by relations query
/// against: cameras (#2) and the two small, mostly-static critical
/// infrastructure domains (#5, #7, #10). Aircraft/seismic/fire are never
/// stored here — they arrive as a batch and are correlated immediately,
/// they are never themselves the *target* of a lookup.
pub(crate) struct CorrelationEngine {
    camera: DomainStore,
    military_base: DomainStore,
    nuclear_site: DomainStore,
}

impl CorrelationEngine {
    pub(crate) fn new() -> Self {
        Self {
            camera: DomainStore::new(Duration::from_secs(CAMERA_STORE_TTL_SECONDS)),
            military_base: DomainStore::new(Duration::from_secs(STATIC_DOMAIN_STORE_TTL_SECONDS)),
            nuclear_site: DomainStore::new(Duration::from_secs(STATIC_DOMAIN_STORE_TTL_SECONDS)),
        }
    }

    /// Feeds one entity into its domain's accumulator. No-op for tables this
    /// engine doesn't index (everything except camera/military_base/nuclear_site).
    pub(crate) fn ingest(&mut self, table: &str, id: &str, payload: &Value) {
        let Some((lat, lon)) = extract_lat_lon(payload) else {
            return;
        };
        let store = match table {
            "camera" => &mut self.camera,
            "military_base" => &mut self.military_base,
            "nuclear_site" => &mut self.nuclear_site,
            _ => return,
        };
        store.upsert(id.to_string(), lat, lon);
    }

    pub(crate) fn domain_sizes(&self) -> (usize, usize, usize) {
        (
            self.camera.len(),
            self.military_base.len(),
            self.nuclear_site.len(),
        )
    }

    /// #2 `aircraft -> monitored_by -> camera` (altitude gate, top-K nearest)
    /// and #10 `aircraft(is_military) -> near -> military_base` (is_military
    /// gate, no altitude bound). Both gates are re-checked here per-relation
    /// even though the upstream `GRAPH_AIRCRAFT_FILTER` admission gate
    /// (`aircraft_filter.rs`) already implies both today — so each relation
    /// keeps its own correct threshold if that upstream filter is ever
    /// relaxed independently (e.g. `GRAPH_AIRCRAFT_FILTER=none`).
    pub(crate) fn correlate_aircraft(
        &mut self,
        batch: &[(String, Value)],
        thresholds: &CorrelationThresholds,
    ) -> Vec<RelationEdge> {
        if batch.is_empty() {
            return Vec::new();
        }

        self.camera.ensure_fresh();
        self.military_base.ensure_fresh();
        let camera_index = self.camera.index();
        let base_index = self.military_base.index();

        let (monitored_timestamp, monitored_expires) =
            relation_window(thresholds.monitored_by_ttl_seconds);
        let (near_timestamp, near_expires) =
            relation_window(thresholds.aircraft_near_base_ttl_seconds);

        let mut edges = Vec::new();
        for (aircraft_id, payload) in batch {
            let Some((lat, lon)) = extract_lat_lon(payload) else {
                continue;
            };
            let altitude_m = payload.get("altitude_m").and_then(Value::as_f64);
            let is_military = payload
                .get("is_military")
                .and_then(Value::as_bool)
                .unwrap_or(false);

            if altitude_m
                .map(|altitude| altitude < thresholds.monitored_by_max_altitude_m)
                .unwrap_or(false)
            {
                for (camera_id, distance_km) in nearest_within(
                    camera_index,
                    lat,
                    lon,
                    thresholds.monitored_by_max_distance_km,
                    thresholds.monitored_by_top_k,
                ) {
                    let score =
                        score_from_distance_km(distance_km, thresholds.monitored_by_max_distance_km);
                    let explain = json!({
                        "rule": "monitored_by:aircraft_camera_proximity",
                        "distance_km": round2(distance_km),
                        "max_distance_km": thresholds.monitored_by_max_distance_km,
                        "altitude_m": altitude_m,
                        "altitude_threshold_m": thresholds.monitored_by_max_altitude_m,
                        "top_k": thresholds.monitored_by_top_k,
                        "sources": ["adsb.lol", "cameras"],
                    });
                    edges.push(RelationEdge {
                        from_table: "aircraft",
                        from_id: aircraft_id.clone(),
                        relation: "monitored_by",
                        to_table: "camera",
                        to_id: camera_id,
                        attributes: relation_attributes(
                            Some(&monitored_expires),
                            Some(&monitored_timestamp),
                            Some(score),
                            Some("consumer_graph::correlation"),
                            Some(explain),
                        ),
                    });
                }
            }

            if is_military {
                for (base_id, distance_km) in nearest_within(
                    base_index,
                    lat,
                    lon,
                    thresholds.aircraft_near_base_radius_km,
                    usize::MAX,
                ) {
                    let score =
                        score_from_distance_km(distance_km, thresholds.aircraft_near_base_radius_km);
                    let explain = json!({
                        "rule": "near:military_aircraft_base_proximity",
                        "distance_km": round2(distance_km),
                        "max_distance_km": thresholds.aircraft_near_base_radius_km,
                        "is_military": true,
                        "sources": ["adsb.lol/v2/mil", "military_bases.json"],
                    });
                    edges.push(RelationEdge {
                        from_table: "aircraft",
                        from_id: aircraft_id.clone(),
                        relation: "near",
                        to_table: "military_base",
                        to_id: base_id,
                        attributes: relation_attributes(
                            Some(&near_expires),
                            Some(&near_timestamp),
                            Some(score),
                            Some("consumer_graph::correlation"),
                            Some(explain),
                        ),
                    });
                }
            }
        }

        edges
    }

    /// #5 `seismic_event(M>=4.5) -> near -> nuclear_site | military_base`.
    pub(crate) fn correlate_seismic(
        &mut self,
        batch: &[(String, Value)],
        thresholds: &CorrelationThresholds,
    ) -> Vec<RelationEdge> {
        if batch.is_empty() {
            return Vec::new();
        }

        self.military_base.ensure_fresh();
        self.nuclear_site.ensure_fresh();
        let base_index = self.military_base.index();
        let nuclear_index = self.nuclear_site.index();
        let (timestamp, expires_at) = relation_window(thresholds.seismic_near_ttl_seconds);

        let mut edges = Vec::new();
        for (event_id, payload) in batch {
            let Some(magnitude) = payload.get("magnitude").and_then(Value::as_f64) else {
                continue;
            };
            if magnitude < thresholds.seismic_min_magnitude {
                continue;
            }
            let Some((lat, lon)) = extract_lat_lon(payload) else {
                continue;
            };

            for (target_table, index) in [
                ("military_base", base_index),
                ("nuclear_site", nuclear_index),
            ] {
                for (target_id, distance_km) in
                    nearest_within(index, lat, lon, thresholds.seismic_near_radius_km, usize::MAX)
                {
                    let score =
                        score_from_distance_km(distance_km, thresholds.seismic_near_radius_km);
                    let explain = json!({
                        "rule": "near:seismic_critical_infrastructure",
                        "magnitude": magnitude,
                        "min_magnitude": thresholds.seismic_min_magnitude,
                        "distance_km": round2(distance_km),
                        "max_distance_km": thresholds.seismic_near_radius_km,
                        "sources": ["usgs.gov/2.5_day", format!("{target_table}.json")],
                    });
                    edges.push(RelationEdge {
                        from_table: "seismic_event",
                        from_id: event_id.clone(),
                        relation: "near",
                        to_table: target_table,
                        to_id: target_id,
                        attributes: relation_attributes(
                            Some(&expires_at),
                            Some(&timestamp),
                            Some(score),
                            Some("consumer_graph::correlation"),
                            Some(explain),
                        ),
                    });
                }
            }
        }

        edges
    }

    /// #7 `fire_hotspot(FRP haut) -> near -> nuclear_site | military_base`.
    /// The weather side of #7 (`affected_by`) reuses the existing
    /// small-table linear scan in `graph_links.rs` — see
    /// `GraphBusConsumer::run_correlation_pass`.
    pub(crate) fn correlate_fire(
        &mut self,
        batch: &[(String, Value)],
        thresholds: &CorrelationThresholds,
    ) -> Vec<RelationEdge> {
        if batch.is_empty() {
            return Vec::new();
        }

        self.military_base.ensure_fresh();
        self.nuclear_site.ensure_fresh();
        let base_index = self.military_base.index();
        let nuclear_index = self.nuclear_site.index();
        let (timestamp, expires_at) = relation_window(thresholds.fire_near_ttl_seconds);

        let mut edges = Vec::new();
        for (fire_id, payload) in batch {
            if !fire_admitted(payload, thresholds) {
                continue;
            }
            let Some((lat, lon)) = extract_lat_lon(payload) else {
                continue;
            };
            let frp = payload.get("frp").and_then(Value::as_f64).unwrap_or(0.0);

            for (target_table, index) in [
                ("military_base", base_index),
                ("nuclear_site", nuclear_index),
            ] {
                for (target_id, distance_km) in
                    nearest_within(index, lat, lon, thresholds.fire_near_radius_km, usize::MAX)
                {
                    let score = score_from_distance_km(distance_km, thresholds.fire_near_radius_km);
                    let explain = json!({
                        "rule": "near:fire_critical_infrastructure",
                        "frp_mw": frp,
                        "min_frp_mw": thresholds.fire_min_frp_mw,
                        "confidence": payload.get("confidence"),
                        "distance_km": round2(distance_km),
                        "max_distance_km": thresholds.fire_near_radius_km,
                        "sources": ["nasa-firms", format!("{target_table}.json")],
                    });
                    edges.push(RelationEdge {
                        from_table: "fire_hotspot",
                        from_id: fire_id.clone(),
                        relation: "near",
                        to_table: target_table,
                        to_id: target_id,
                        attributes: relation_attributes(
                            Some(&expires_at),
                            Some(&timestamp),
                            Some(score),
                            Some("consumer_graph::correlation"),
                            Some(explain),
                        ),
                    });
                }
            }
        }

        edges
    }
}

impl GraphBusConsumer {
    /// Event-driven correlation pass, run once per envelope after every
    /// entity in it has been upserted (`consumer.rs::handle_envelope`).
    pub(crate) async fn run_correlation_pass(
        &self,
        aircraft_batch: Vec<(String, Value)>,
        seismic_batch: Vec<(String, Value)>,
        fire_batch: Vec<(String, Value)>,
    ) -> anyhow::Result<()> {
        if aircraft_batch.is_empty() && seismic_batch.is_empty() && fire_batch.is_empty() {
            return Ok(());
        }

        let mut edges = Vec::new();
        {
            let mut engine = self.correlation.lock().await;
            let aircraft_edges = engine.correlate_aircraft(&aircraft_batch, &self.thresholds);
            let seismic_edges = engine.correlate_seismic(&seismic_batch, &self.thresholds);
            let fire_edges = engine.correlate_fire(&fire_batch, &self.thresholds);
            let (cameras, bases, sites) = engine.domain_sizes();

            info!(
                aircraft_in = aircraft_batch.len(),
                seismic_in = seismic_batch.len(),
                fire_in = fire_batch.len(),
                monitored_by_and_near_aircraft = aircraft_edges.len(),
                near_seismic = seismic_edges.len(),
                near_fire = fire_edges.len(),
                camera_domain_size = cameras,
                military_base_domain_size = bases,
                nuclear_site_domain_size = sites,
                "correlation pass computed edges"
            );

            edges.extend(aircraft_edges);
            edges.extend(seismic_edges);
            edges.extend(fire_edges);
        }

        // #7's weather side (`affected_by`) reuses the existing small-table
        // (dozens of stations) linear scan rather than the R-tree engine —
        // fires that pass the FRP/confidence gate are already a small,
        // pre-filtered slice (measured ~0.4% of the raw FIRMS feed).
        for (fire_id, fire_payload) in &fire_batch {
            if !fire_admitted(fire_payload, &self.thresholds) {
                continue;
            }
            let zone_ids = self.resolve_location_zone_ids(fire_payload);
            self.link_subject_to_low_visibility_weather("fire_hotspot", fire_id, &zone_ids)
                .await?;
        }

        self.flush_relation_edges(edges).await
    }

    /// Writes queued edges via `graph::relations::link_batch`, chunked to
    /// `RELATE_BATCH_CHUNK_SIZE` and flushed with `RELATE_BATCH_CONCURRENCY`
    /// concurrent in-flight chunks (bounded concurrency, not a sequential
    /// `for … .await` per edge — Lot 4's write-budget requirement).
    async fn flush_relation_edges(&self, edges: Vec<RelationEdge>) -> anyhow::Result<()> {
        if edges.is_empty() {
            return Ok(());
        }
        let total = edges.len();
        let client = self.client.clone();

        let chunks: Vec<Vec<RelationEdge>> = edges
            .chunks(RELATE_BATCH_CHUNK_SIZE)
            .map(<[RelationEdge]>::to_vec)
            .collect();

        let results: Vec<anyhow::Result<usize>> = stream::iter(chunks.into_iter().map(|chunk| {
            let client = client.clone();
            async move { graph::relations::link_batch(&client, &chunk).await }
        }))
        .buffer_unordered(RELATE_BATCH_CONCURRENCY)
        .collect()
        .await;

        let mut written = 0usize;
        for result in results {
            written += result?;
        }

        info!(edges = total, written, "correlation pass flushed relation batch");
        Ok(())
    }
}
