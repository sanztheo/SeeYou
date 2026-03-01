# Data Sources

SeeYou aggregates live data from **12+ free public APIs**. Total cost: **$0**.

## Real-Time Sources (WebSocket-Pushed)

### ADS-B Exchange (adsb.lol)

| Field | Value |
|-------|-------|
| **URL** | `https://api.adsb.lol/v2` |
| **Endpoints** | `/v2/point/{lat}/{lon}/{radius}`, `/v2/mil` |
| **Data** | Live aircraft positions (ADS-B transponder data) |
| **Coverage** | Global (~30,000 concurrent aircraft) |
| **Rate** | Polled every 2 seconds |
| **Auth** | None (free API) |
| **Fetch strategy** | 44 geographic grid points × 250nm radius + dedicated military endpoint |

Provides: ICAO hex, callsign, aircraft type, latitude, longitude, altitude (feet), ground speed (knots), heading, vertical rate (fpm), on-ground flag, military flag.

### CelesTrak

| Field | Value |
|-------|-------|
| **URL** | `https://celestrak.org/NORAD/elements/gp.php` |
| **Data** | Two-Line Element (TLE) orbital data |
| **Coverage** | ~10,000 tracked objects |
| **Rate** | TLE fetch every 6 hours, propagation every 60 seconds |
| **Auth** | None |
| **Groups fetched** | `stations`, `starlink`, `military`, `weather`, `navigation`, `active` |

TLE data is parsed and propagated to current positions using the SGP4 algorithm with WGS-84 geodetic conversion.

### aviationweather.gov

| Field | Value |
|-------|-------|
| **URL** | `https://aviationweather.gov/api/data/metar` |
| **Data** | METAR aviation weather observations |
| **Coverage** | Global (~5,000 stations) |
| **Rate** | Polled every 5 minutes |
| **Auth** | None |
| **Parameters** | `format=json&taf=false&hours=1&bbox=-180,-90,180,90` |

Provides: station ID, coordinates, temperature, dewpoint, wind (direction, speed, gusts), visibility, ceiling, flight category, raw METAR text.

## On-Demand Sources (REST-Fetched)

### NASA EONET v3

| Field | Value |
|-------|-------|
| **URL** | `https://eonet.gsfc.nasa.gov/api/v3/events` |
| **Data** | Active natural disaster events |
| **Coverage** | Global |
| **Rate** | Polled every 30 minutes |
| **Auth** | None |
| **Parameters** | `status=open&limit=100` |

Categories: wildfires, severe storms, volcanoes, earthquakes, floods, sea and lake ice.

### Open-Meteo

| Field | Value |
|-------|-------|
| **URL** | `https://api.open-meteo.com/v1/forecast` |
| **Data** | Current weather conditions |
| **Coverage** | 40 grid points across all continents |
| **Rate** | Polled every 10 minutes |
| **Auth** | None |
| **Parameters** | `temperature_2m`, `relative_humidity_2m`, `precipitation`, `cloud_cover`, `pressure_msl`, `wind_speed_10m`, `wind_direction_10m` |

### RainViewer

| Field | Value |
|-------|-------|
| **URL** | `https://api.rainviewer.com/public/weather-maps.json` |
| **Data** | Weather radar tile URLs and timestamps |
| **Coverage** | Global radar coverage |
| **Rate** | Frontend-fetched every 5 minutes |
| **Auth** | None |

Provides timestamped radar tile URLs that are rendered as CesiumJS `ImageryLayer` overlays on the globe.

### Overpass API (OpenStreetMap)

| Field | Value |
|-------|-------|
| **URL** | `https://overpass-api.de/api/interpreter` |
| **Data** | Road network geometry |
| **Coverage** | Global (OSM data) |
| **Rate** | On-demand per viewport, cached 1 hour |
| **Auth** | None |
| **Query** | Overpass QL for `highway=motorway\|trunk\|primary\|secondary` within bbox |

Road types: motorway, trunk, primary, secondary, tertiary. Each road includes node coordinates and optional speed limit from OSM tags.

### Nominatim (Geocoding)

| Field | Value |
|-------|-------|
| **URL** | Via backend `/geocode` endpoint |
| **Data** | Location search results |
| **Coverage** | Global |
| **Rate** | On-demand, cached 24 hours |
| **Auth** | None |

### adsb.lol Route API

| Field | Value |
|-------|-------|
| **URL** | `https://api.adsb.lol/api/0/routeset` |
| **Data** | Flight routes (departure/arrival airports) |
| **Coverage** | Aircraft with active flight plans |
| **Rate** | On-demand per selected aircraft |
| **Auth** | None |

Frontend-only integration (not proxied through backend). Includes in-memory cache.

## Camera Sources

| Provider | API URL | Coverage | Camera Count |
|----------|---------|----------|-------------|
| **TfL** | `api.tfl.gov.uk/Place/Type/JamCam` | London, UK | ~900 |
| **NYC DOT** | `webcams.nyctmc.org/api/cameras/` | New York, US | ~700 |
| **Caltrans** | `cwwp2.dot.ca.gov/data/d{N}/cctv/` | California, US | ~2,500 |
| **OpenTrafficCamMap** | GitHub raw JSON | USA-wide | Variable |
| **mcp.camera** | `mcp.camera/api/cameras` | United States | Up to 5,000 |
| **Generic** | Paris OpenData + hardcoded | 30+ cities | Variable |

All camera feeds are proxied through the backend (`/cameras/proxy`) to bypass CORS.

## Data Freshness Summary

| Source | Poll Interval | Redis TTL | Typical Latency |
|--------|--------------|-----------|----------------|
| Aircraft (ADS-B) | 2s | 15s | ~2-3s |
| Satellites (TLE) | 60s | 60s | ~60s |
| METAR | 300s | 300s | ~5min |
| Cameras | 300s | 300s | ~5min (health check) |
| Weather | 600s | 600s | ~10min |
| Events | 1800s | 1800s | ~30min |
| Roads | On-demand | 3600s | Depends on Overpass API |
| Geocode | On-demand | 86400s | Depends on Nominatim |

## Rate Limiting & Fair Use

SeeYou does not implement rate limiting on its own API. However, external APIs have implicit or explicit rate limits:

| API | Known Limits |
|-----|-------------|
| adsb.lol | No documented limit (community API) |
| CelesTrak | Fair use — TLE data cached for 6 hours |
| Overpass API | ~10,000 requests/day (shared public instance) |
| Nominatim | 1 request/second (geocoding policy) |
| Open-Meteo | 10,000 requests/day (free tier) |
| RainViewer | No documented limit |
| aviationweather.gov | No documented limit |

SeeYou's polling intervals are configured to stay well within these limits.
