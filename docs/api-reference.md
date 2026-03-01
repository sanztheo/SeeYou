# REST API Reference

The backend exposes 7 REST endpoints, all served via Axum on port 3001. All responses are JSON with CORS enabled.

**Base URL**: `http://localhost:3001`

---

## Health Check

```
GET /health
```

Verifies the server and Redis connection are operational.

**Response** `200 OK`:

```json
{
  "status": "ok",
  "redis": "connected"
}
```

If Redis is unreachable, `redis` will be `"disconnected"` but the endpoint still returns 200.

---

## Aircraft Roads

```
GET /roads?south={s}&west={w}&north={n}&east={e}&offset={offset}&limit={limit}
```

Fetches road network data from OSM Overpass API for a given bounding box.

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `south` | f64 | Yes | — | Southern latitude bound |
| `west` | f64 | Yes | — | Western longitude bound |
| `north` | f64 | Yes | — | Northern latitude bound |
| `east` | f64 | Yes | — | Eastern longitude bound |
| `offset` | u32 | No | 0 | Pagination offset |
| `limit` | u32 | No | 1000 | Max roads to return |

**Validation**:
- All coordinates must be valid numbers (NaN rejected)
- Latitude: -90 to 90, Longitude: -180 to 180
- Maximum bbox area: 25.0 square degrees

**Response** `200 OK`:

```json
{
  "roads": [
    {
      "id": 123456,
      "road_type": "motorway",
      "name": "A6",
      "nodes": [
        { "lat": 48.8566, "lon": 2.3522 },
        { "lat": 48.8600, "lon": 2.3550 }
      ],
      "speed_limit_kmh": 130
    }
  ],
  "total": 245,
  "bbox": { "south": 48.8, "west": 2.2, "north": 48.9, "east": 2.4 }
}
```

**Road Types**: `motorway`, `trunk`, `primary`, `secondary`, `tertiary`

**Caching**: 1 hour per bounding box.

---

## Cameras

### List Cameras

```
GET /cameras?south={s}&west={w}&north={n}&east={e}&offset={offset}&limit={limit}
```

Returns all cached cameras, optionally filtered by bounding box.

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `south` | f64 | No | — | Southern latitude bound |
| `west` | f64 | No | — | Western longitude bound |
| `north` | f64 | No | — | Northern latitude bound |
| `east` | f64 | No | — | Eastern longitude bound |
| `offset` | u32 | No | 0 | Pagination offset |
| `limit` | u32 | No | 500 | Max cameras per page |

**Response** `200 OK`:

```json
{
  "cameras": [
    {
      "id": "tfl-jamcam-00001",
      "name": "A1 Holloway Road",
      "lat": 51.5534,
      "lon": -0.1167,
      "city": "London",
      "country": "GB",
      "source": "tfl",
      "stream_url": "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/...",
      "stream_type": "ImageRefresh",
      "is_online": true
    }
  ],
  "total": 5234
}
```

**Stream Types**: `Mjpeg`, `ImageRefresh`, `Hls`

### Camera Proxy

```
GET /cameras/proxy?url={encoded_url}
```

Proxies a camera stream URL through the backend to bypass CORS.

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | String | Yes | URL-encoded camera stream URL |

**Response**: Raw image/stream bytes with headers:
- `Content-Type`: forwarded from source
- `Access-Control-Allow-Origin: *`
- `Cache-Control: max-age=5`

**Timeout**: 10 seconds.

---

## Geocode

```
GET /geocode?q={query}&limit={limit}
```

Searches for locations by name using Nominatim.

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | String | Yes | — | Search query (min 2 characters) |
| `limit` | u32 | No | 8 | Max results (capped at 20) |

**Response** `200 OK`:

```json
{
  "results": [
    {
      "name": "Paris",
      "display_name": "Paris, Ile-de-France, France",
      "lat": 48.8566,
      "lon": 2.3522
    }
  ]
}
```

**Caching**: 24 hours per normalized query.

---

## Events

```
GET /events
```

Returns active natural disaster events from NASA EONET.

**Response** `200 OK`:

```json
{
  "events": [
    {
      "id": "EONET_6401",
      "title": "Wildfire - California",
      "category": "wildfires",
      "lat": 34.0522,
      "lon": -118.2437,
      "date": "2026-02-28T12:00:00Z",
      "source_url": "https://eonet.gsfc.nasa.gov/..."
    }
  ],
  "fetched_at": "2026-03-01T10:30:00Z"
}
```

**Event Categories**: `wildfires`, `severe_storms`, `volcanoes`, `earthquakes`, `floods`, `sea_and_lake_ice`, `other`

**Caching**: 30 minutes.

---

## Weather

```
GET /weather
```

Returns the global weather grid (40 points across all continents).

**Response** `200 OK`:

```json
{
  "points": [
    {
      "lat": 48.8566,
      "lon": 2.3522,
      "temperature_c": 12.5,
      "wind_speed_ms": 3.2,
      "wind_direction_deg": 225,
      "pressure_hpa": 1013.25,
      "cloud_cover_pct": 75,
      "precipitation_mm": 0.5,
      "humidity_pct": 68
    }
  ],
  "fetched_at": "2026-03-01T10:30:00Z"
}
```

**Caching**: 10 minutes.

---

## Error Responses

| Status | Body | When |
|--------|------|------|
| `400 Bad Request` | `"Invalid bounding box"` | Invalid coordinates, NaN, area too large |
| `404 Not Found` | `"Not found"` | Resource doesn't exist |
| `500 Internal Server Error` | `"Internal error: ..."` | Redis down, upstream API failure |

## CORS Configuration

All endpoints allow:
- **Origins**: `http://localhost:5173` (dev) + configurable production origins
- **Methods**: GET, POST, OPTIONS
- **Headers**: Content-Type, Authorization
