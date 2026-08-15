pub(crate) const DEFAULT_FLIES_OVER_TTL_SECONDS: i64 = 180;
pub(crate) const DEFAULT_RELATION_SWEEP_INTERVAL_SECONDS: u64 = 30;
pub(crate) const DEFAULT_NEAREST_ZONE_MAX_DISTANCE_KM: f64 = 100.0;
pub(crate) const DEFAULT_TABLE_CACHE_TTL_MS: u64 = 2_000;
pub(crate) const LOW_VISIBILITY_THRESHOLD_M: f64 = 1000.0;

// A LEO satellite ground track crosses a zone in ~2 minutes (seeyou-v2.md
// #4b): 240s is the midpoint of the plan's 120-300s window.
pub(crate) const DEFAULT_PASSES_OVER_TTL_SECONDS: i64 = 240;

// --- Lot 5 anti-bruit thresholds (docs/plans/seeyou-v2.md §Anti-bruit) ---
// All overridable via env in `correlation::CorrelationThresholds::from_env`.

/// #2 monitored_by admission: cruise-altitude aircraft are not visible to
/// any ground camera — eliminates ~90% of the already-prefiltered set.
pub(crate) const DEFAULT_MONITORED_BY_MAX_ALTITUDE_M: f64 = 3000.0;
/// #2 budget: best-placed cameras per aircraft, not every camera in range.
pub(crate) const DEFAULT_MONITORED_BY_TOP_K: usize = 3;
/// #2 TTL — same window as flies_over (aircraft positions move fast).
pub(crate) const DEFAULT_MONITORED_BY_TTL_SECONDS: i64 = 180;

/// #10 aircraft(is_military) -> near -> military_base admission radius.
/// Not specified numerically by the plan ("haversine < R"); chosen as a
/// reasonable "in the vicinity of the base" radius for a low-flying
/// aircraft, documented here so it's one visible, overridable knob.
pub(crate) const DEFAULT_AIRCRAFT_NEAR_BASE_RADIUS_KM: f64 = 10.0;
pub(crate) const DEFAULT_AIRCRAFT_NEAR_BASE_TTL_SECONDS: i64 = 180;

/// #5 seismic(M>=4.5) -> near -> nuclear_site/military_base — both values
/// given explicitly by the plan.
pub(crate) const DEFAULT_SEISMIC_MIN_MAGNITUDE: f64 = 4.5;
pub(crate) const DEFAULT_SEISMIC_NEAR_RADIUS_KM: f64 = 150.0;
/// "TTL long" (plan) — aftershock-relevance window, not a single pass.
pub(crate) const DEFAULT_SEISMIC_NEAR_TTL_SECONDS: i64 = 86_400;

/// #7 fire_hotspot(FRP haut) -> near -> military_base/nuclear_site.
/// Measured empirically against the local FIRMS ingest (2026-08-13, 86464
/// hotspots): among confidence="high" records (5561), FRP>=100 MW keeps 352
/// (top ~6.3% of high-confidence energy, p95 measured at 116.66 MW) — close
/// to the plan's "top ~5%" and a clean round default.
pub(crate) const DEFAULT_FIRE_MIN_FRP_MW: f64 = 100.0;
/// Not specified numerically by the plan; a fire's blast/smoke-relevant
/// radius to critical infrastructure is inherently smaller than a seismic
/// shake radius, hence a tighter default than #5.
pub(crate) const DEFAULT_FIRE_NEAR_RADIUS_KM: f64 = 20.0;
pub(crate) const DEFAULT_FIRE_NEAR_TTL_SECONDS: i64 = 10_800;

/// In-memory spatial store cadence: how long a camera/base/site survives in
/// its domain's R-tree without a refresh before being dropped. Cameras
/// republish ~every 900s (plan); bases/sites republish hourly (server
/// main.rs) — both TTLs are set well above their source cadence so a single
/// missed refresh doesn't empty the index.
pub(crate) const CAMERA_STORE_TTL_SECONDS: u64 = 1_800;
pub(crate) const STATIC_DOMAIN_STORE_TTL_SECONDS: u64 = 7_200;

/// Lot 4 write-budget gate: batch size and bounded concurrency for
/// `graph::relations::link_batch` flushes.
pub(crate) const RELATE_BATCH_CHUNK_SIZE: usize = 200;
pub(crate) const RELATE_BATCH_CONCURRENCY: usize = 4;
