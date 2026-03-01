# WebSocket Protocol

The WebSocket connection is the primary real-time data channel between the backend and all connected frontend clients.

## Connection

```
ws://localhost:3001/ws
```

On connect, the server assigns a unique client ID and sends a greeting:

```json
{ "type": "Connected", "payload": { "client_id": "550e8400-e29b-41d4-a716-446655440000" } }
```

## Message Format

All messages use a tagged JSON format with `type` and optional `payload`:

```json
{
  "type": "MessageType",
  "payload": { ... }
}
```

## Message Types

### Server → Client

#### Connected

Sent once on connection establishment.

```json
{
  "type": "Connected",
  "payload": { "client_id": "uuid-string" }
}
```

#### AircraftBatch

Chunked delivery of aircraft positions. Sent every 2 seconds.

```json
{
  "type": "AircraftBatch",
  "payload": {
    "aircraft": [
      {
        "icao": "a1b2c3",
        "callsign": "UAL123",
        "aircraft_type": "B738",
        "lat": 48.8566,
        "lon": 2.3522,
        "altitude_m": 10668,
        "speed_ms": 230.5,
        "heading": 045.0,
        "vertical_rate_ms": 0.0,
        "on_ground": false,
        "is_military": false
      }
    ],
    "chunk_index": 0,
    "total_chunks": 3
  }
}
```

Each chunk contains up to **2,000 aircraft**. The frontend accumulates chunks and flushes to state when `chunk_index === total_chunks - 1`.

#### SatelliteBatch

Chunked delivery of satellite positions. Sent every 60 seconds.

```json
{
  "type": "SatelliteBatch",
  "payload": {
    "satellites": [
      {
        "norad_id": 25544,
        "name": "ISS (ZARYA)",
        "category": "station",
        "lat": 28.5,
        "lon": -80.6,
        "altitude_km": 408.2,
        "velocity_km_s": 7.66
      }
    ],
    "chunk_index": 0,
    "total_chunks": 5
  }
}
```

Each chunk contains up to **2,000 satellites**.

**Satellite Categories**: `station`, `starlink`, `communication`, `military`, `weather`, `navigation`, `science`, `other`

#### Predictions

Military aircraft trajectory predictions from the IMM-EKF engine.

```json
{
  "type": "Predictions",
  "payload": {
    "trajectories": [
      {
        "icao": "ae1234",
        "pattern": "orbit",
        "points": [
          {
            "lat": 48.856,
            "lon": 2.352,
            "alt_m": 9144,
            "dt_secs": 5.0,
            "sigma_xy_m": 50.0,
            "sigma_z_m": 25.0
          }
        ]
      }
    ]
  }
}
```

**Military Patterns**: `orbit`, `cap` (combat air patrol), `transit`, `holding`, `null` (no pattern detected)

Each trajectory contains 60 points (5-second steps over 300 seconds). Uncertainty (`sigma_xy_m`, `sigma_z_m`) grows with prediction horizon.

#### MetarUpdate

Global aviation weather station data.

```json
{
  "type": "MetarUpdate",
  "payload": {
    "stations": [
      {
        "station_id": "LFPG",
        "lat": 49.0097,
        "lon": 2.5478,
        "temp_c": 12.0,
        "dewpoint_c": 8.0,
        "wind_dir_deg": 270,
        "wind_speed_kt": 15,
        "wind_gust_kt": null,
        "visibility_m": 9999,
        "ceiling_ft": 3000,
        "flight_category": "VFR",
        "raw_metar": "LFPG 011030Z 27015KT 9999 FEW030 12/08 Q1013"
      }
    ]
  }
}
```

**Flight Categories**: `VFR`, `MVFR`, `IFR`, `LIFR`

#### Ping

Server heartbeat.

```json
{ "type": "Ping" }
```

#### Error

Error notification.

```json
{
  "type": "Error",
  "payload": { "message": "Invalid message format" }
}
```

### Client → Server

#### Pong

Response to server Ping (sent automatically by the frontend).

```json
{ "type": "Pong" }
```

## Chunked Delivery Protocol

Large datasets are split into numbered chunks to avoid oversized WebSocket frames:

```
Server sends:
  { type: "AircraftBatch", payload: { aircraft: [...2000], chunk_index: 0, total_chunks: 3 } }
  { type: "AircraftBatch", payload: { aircraft: [...2000], chunk_index: 1, total_chunks: 3 } }
  { type: "AircraftBatch", payload: { aircraft: [...1500], chunk_index: 2, total_chunks: 3 } }

Client accumulates:
  buffer[0] = [...2000]
  buffer[1] = [...2000]
  buffer[2] = [...1500]  ← chunk_index === total_chunks - 1 → flush!

Client flushes:
  Map<icao, AircraftPosition> updated with all 5500 aircraft
```

## Reconnection Strategy

The frontend implements automatic reconnection with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 2,000 ms |
| 2 | 3,000 ms |
| 3 | 4,500 ms |
| 4 | 6,750 ms |
| 5 | 10,125 ms |
| ... | × 1.5 per attempt |
| 10 | ~57,000 ms (max) |

After 10 failed attempts, reconnection stops until page refresh.

## Broadcast Architecture

```
                    tokio::broadcast::Sender (capacity: 256)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   Client A              Client B              Client C
   (Receiver)            (Receiver)            (Receiver)
   tokio::select!        tokio::select!        tokio::select!
   ├─ inbound frames     ├─ inbound frames     ├─ inbound frames
   └─ broadcast relay    └─ broadcast relay    └─ broadcast relay
```

Each connected client subscribes to the broadcast channel. Messages from any tracker are delivered to all clients simultaneously. If a client falls behind (>256 messages in buffer), it receives a `Lagged` error and catches up.
