# Data Trackers

The backend runs 6 independent background tasks (tokio green threads) that continuously poll external APIs, transform the data, cache it in Redis, and broadcast updates via WebSocket.

## Aircraft Tracker

**Crate**: `services` | **Interval**: 2 seconds | **Source**: adsb.lol

The most complex tracker — it fetches, merges, predicts, and broadcasts aircraft positions.

### Pipeline

```
1. Concurrent fetch:
   ├── fetch_all_regions() → 44 grid points × 250nm radius
   └── fetch_military()    → /v2/mil endpoint
                │
2. Merge & deduplicate by ICAO hex (military wins on conflict)
                │
3. Cap at 30,000 aircraft
                │
4. Cache to Redis (key: "aircraft:all", TTL: 15s)
                │
5. Run IMM-EKF predictions on in-flight military aircraft
                │
6. Broadcast Predictions message
                │
7. Chunk into batches of 2,000
                │
8. Broadcast AircraftBatch messages (N chunks)
```

### Regional Fetch Strategy

The adsb.lol API is queried at 44 geographic grid points covering major air traffic regions worldwide, each with a 250 nautical mile radius. Results are deduplicated by ICAO hex code.

### Unit Conversions

| Source | Target | Factor |
|--------|--------|--------|
| Feet → Meters | altitude | × 0.3048 |
| Knots → m/s | speed | × 0.51444 |
| Feet/min → m/s | vertical rate | ÷ 196.85 |

### Military Detection

Aircraft are flagged as military when `dbFlags & 1` is set in the adsb.lol response, or when sourced from the `/v2/mil` endpoint.

## Satellite Tracker

**Crate**: `satellites` | **Interval**: 60 seconds | **Source**: CelesTrak

### Pipeline

```
1. Fetch TLE data from 6 CelesTrak groups (concurrent):
   ├── stations     (ISS, Tiangong, etc.)
   ├── starlink     (SpaceX Starlink constellation)
   ├── military     (Military satellites)
   ├── weather      (Weather satellites)
   ├── navigation   (GPS, GLONASS, Galileo)
   └── active       (All active satellites)
                │
2. Parse TLE 3-line format (name, line1, line2)
                │
3. SGP4 propagation → current geodetic position
   ├── TEME (ECI) coordinates from SGP4
   ├── Convert to geodetic (WGS-84, iterative Bowring's method)
   └── Compute velocity magnitude + orbit period
                │
4. Cap at 10,000 satellites
                │
5. Cache to Redis (key: "satellites:all", TTL: 60s)
                │
6. Chunk into batches of 2,000
                │
7. Broadcast SatelliteBatch messages
```

### TLE Caching

TLE data is cached locally and re-fetched every 6 hours (orbital elements change slowly). Between TLE updates, only the SGP4 propagation step runs with the cached elements.

### Geodetic Conversion

The SGP4 library outputs TEME (True Equator Mean Equinox) coordinates. Conversion to geodetic (lat/lon/alt) uses:

1. TEME → approximate ECI position
2. ECI → geodetic via iterative Bowring's method on WGS-84 ellipsoid
3. Velocity magnitude computed from TEME velocity vector

## Camera Tracker

**Crate**: `cameras` | **Interval**: 300 seconds (5 min) | **Sources**: 6 providers

### Pipeline

```
1. Fetch from all 6 providers (concurrent):
   ├── TfL (London JamCam)
   ├── NYC DOT (New York cameras)
   ├── Caltrans (California CCTV, 8 districts)
   ├── OpenTrafficCamMap (USA-wide)
   ├── mcp.camera (US, max 5000)
   └── Generic (Paris + 30 hardcoded cities)
                │
2. Merge all cameras, assign unique IDs
                │
3. Batch health check (HEAD requests, 5s timeout)
   └── Set is_online flag per camera
                │
4. Cache to Redis (key: "cameras:all", TTL: 300s)
```

### Provider Trait

All camera providers implement a common trait:

```rust
#[async_trait]
pub trait CameraProvider: Send + Sync {
    async fn fetch_cameras(&self, client: &Client) -> Result<Vec<Camera>>;
    fn source_name(&self) -> &'static str;
}
```

### Health Checking

Each camera URL receives a HEAD request with a 5-second timeout. If the request succeeds (any 2xx status), `is_online` is set to `true`. Failed requests mark the camera as offline.

## METAR Tracker

**Crate**: `services` | **Interval**: 300 seconds (5 min) | **Source**: aviationweather.gov

### Pipeline

```
1. Fetch global METAR data:
   GET aviationweather.gov/api/data/metar?format=json&taf=false&hours=1&bbox=-180,-90,180,90
                │
2. Parse JSON → MetarStation structs
   ├── Handle variable wind ("VRB" → None)
   ├── Convert visibility (statute miles → meters)
   └── Convert ceiling (hundreds → feet)
                │
3. Cache to Redis (key: "metar:all", TTL: 300s)
                │
4. Broadcast MetarUpdate message
```

## Weather Tracker

**Crate**: `weather` | **Interval**: 600 seconds (10 min) | **Source**: Open-Meteo

### Pipeline

```
1. Query Open-Meteo at 40 grid points across all continents:
   Parameters: temperature_2m, relative_humidity_2m, precipitation,
               cloud_cover, pressure_msl, wind_speed_10m, wind_direction_10m
                │
2. Parse response → WeatherPoint structs
   └── Convert wind speed: km/h → m/s (÷ 3.6)
                │
3. Cache to Redis (key: "weather:grid", TTL: 600s)
```

Weather data is served via REST only (not broadcast via WebSocket) — the frontend fetches it on demand.

## Events Tracker

**Crate**: `events` | **Interval**: 1800 seconds (30 min) | **Source**: NASA EONET v3

### Pipeline

```
1. Fetch active events:
   GET eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100
                │
2. Parse GeoJSON response → NaturalEvent structs
   ├── Swap coordinates (GeoJSON lon,lat → SeeYou lat,lon)
   ├── Use latest geometry point per event
   ├── Map EONET categories to internal enum
   └── Extract first source URL
                │
3. Cache to Redis (key: "events:active", TTL: 1800s)
```

Events data is served via REST only — the frontend fetches it on demand.
