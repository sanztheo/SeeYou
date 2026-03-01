# Camera System

SeeYou aggregates live CCTV camera feeds from 6 providers across 30+ cities worldwide. The camera system handles discovery, health checking, and stream proxying.

## Provider Architecture

All providers implement a common trait:

```rust
#[async_trait]
pub trait CameraProvider: Send + Sync {
    async fn fetch_cameras(&self, client: &Client) -> Result<Vec<Camera>>;
    fn source_name(&self) -> &'static str;
}
```

## Camera Providers

### TfL (Transport for London)

| Field | Value |
|-------|-------|
| **Source** | `api.tfl.gov.uk/Place/Type/JamCam` |
| **Coverage** | London, United Kingdom |
| **Stream type** | ImageRefresh (JPEG snapshots) |
| **Feed count** | ~900 cameras |
| **Update frequency** | Images refresh every few seconds |

### NYC DOT (New York City Department of Transportation)

| Field | Value |
|-------|-------|
| **Source** | `webcams.nyctmc.org/api/cameras/` |
| **Coverage** | New York City, USA |
| **Stream type** | ImageRefresh |
| **Feed count** | ~700 cameras |

### Caltrans (California Department of Transportation)

| Field | Value |
|-------|-------|
| **Source** | `cwwp2.dot.ca.gov/data/d{N}/cctv/` |
| **Coverage** | California, USA (8 highway districts) |
| **Stream type** | ImageRefresh |
| **Feed count** | ~2,500 cameras across 8 districts |

Fetches from 8 Caltrans district endpoints concurrently.

### OpenTrafficCamMap

| Field | Value |
|-------|-------|
| **Source** | `raw.githubusercontent.com/.../USA.json` |
| **Coverage** | USA-wide |
| **Stream type** | Mixed |
| **Feed count** | Variable |

Community-maintained GitHub dataset of traffic camera locations.

### mcp.camera

| Field | Value |
|-------|-------|
| **Source** | `mcp.camera/api/cameras` |
| **Coverage** | United States |
| **Stream type** | Mixed |
| **Feed count** | Up to 5,000 |

### Generic Provider

| Field | Value |
|-------|-------|
| **Source** | Paris OpenData + hardcoded worldwide list |
| **Coverage** | 30+ global cities |
| **Stream type** | Mixed (HLS, MJPEG, ImageRefresh) |

Combines:
- Paris OpenData (`opendata.paris.fr`) camera records
- Manually curated list of known public cameras in major world cities

## Camera Data Model

```rust
pub struct Camera {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub city: String,
    pub country: String,
    pub source: String,          // Provider name
    pub stream_url: String,      // Direct stream URL
    pub stream_type: StreamType, // Mjpeg | ImageRefresh | Hls
    pub is_online: bool,         // Health check result
}

pub enum StreamType {
    Mjpeg,
    ImageRefresh,
    Hls,
}
```

## Health Checking

After fetching cameras from all providers, the tracker performs batch health checks:

1. Each camera URL receives a **HEAD request** with a 5-second timeout
2. Success (any 2xx status) → `is_online = true`
3. Failure (timeout, network error, non-2xx) → `is_online = false`
4. Health checks run concurrently using `tokio::spawn`

## Stream Proxy

The `/cameras/proxy` endpoint acts as a reverse proxy to bypass browser CORS restrictions:

```
Frontend → GET /cameras/proxy?url=<encoded_camera_url> → Backend → Camera Server
                                                            ↓
                                                     Response with:
                                                     - Original content-type
                                                     - Access-Control-Allow-Origin: *
                                                     - Cache-Control: max-age=5
```

| Setting | Value |
|---------|-------|
| Timeout | 10 seconds |
| Cache | 5 seconds |
| CORS | Fully open (`*`) |

## Frontend Integration

The frontend's `CameraPlayer` component supports all three stream types:

| Stream Type | Technology | Behavior |
|------------|-----------|----------|
| **HLS** | HLS.js library | Adaptive bitrate streaming with `.m3u8` playlists |
| **MJPEG** | Native `<img>` tag | Continuous motion JPEG stream |
| **ImageRefresh** | Periodic `<img>` reload | Timer-based image refresh (configurable interval) |

All streams route through the backend proxy:
```
Camera Stream URL → /cameras/proxy?url={encoded} → Display in CameraPlayer
```

## Caching

| Redis Key | TTL | Data |
|-----------|-----|------|
| `cameras:all` | 300s (5 min) | Full camera array with health status |

The frontend further implements chunked loading with pagination (`offset` + `limit`) and progress tracking to handle the large camera dataset without blocking the UI.
