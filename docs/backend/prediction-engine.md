# IMM-EKF Prediction Engine

The prediction engine is the most mathematically sophisticated component of SeeYou. It uses an **Interacting Multiple Model Extended Kalman Filter** (IMM-EKF) to predict military aircraft trajectories up to 5 minutes ahead.

**Crate**: `prediction` | **Depends on**: `nalgebra 0.33`

## Architecture

```
prediction/
├── lib.rs          Public API exports
├── service.rs      PredictionService — per-aircraft state management
├── imm.rs          IMM engine — multi-model fusion
├── ekf.rs          Extended Kalman Filter implementation
├── trajectory.rs   Future trajectory generation
├── history.rs      Position history buffer (30 minutes)
├── models/
│   ├── mod.rs              MotionModel trait definition
│   ├── constant_velocity.rs   Straight-line motion
│   ├── constant_acceleration.rs  Accelerating/decelerating
│   ├── coordinated_turn.rs     Banked turn (uses omega state)
│   └── climb_descend.rs        Vertical rate changes
└── patterns/
    ├── mod.rs         Pattern detection orchestration
    ├── orbit.rs       Circle-fit detection (Kasa method)
    ├── cap.rs         Combat Air Patrol detection
    ├── transit.rs     Straight-line transit detection
    └── holding.rs     Holding pattern detection
```

## Extended Kalman Filter (EKF)

### State Vector (7 dimensions)

```
x = [x, y, vx, vy, z, vz, ω]
     ↑  ↑   ↑   ↑   ↑  ↑   ↑
     ENU position (m)  │   │   │   turn rate (rad/s)
                   ENU velocity (m/s)  │
                              altitude + vertical velocity (m, m/s)
```

All positions are in a local **East-North-Up (ENU)** coordinate frame centered at the aircraft's first observed position.

### Measurement Vector (6 dimensions)

```
z = [x, y, vx, vy, z, vz]
```

Direct observation of position, velocity, and altitude from ADS-B.

### Implementation Details

- **Prediction**: Non-linear state transition via the active motion model
- **Update**: Joseph-form covariance update for numerical stability
- **Log-likelihood**: Returned for IMM model weighting
- **Matrix math**: All operations via `nalgebra` `DMatrix` and `DVector`

## Motion Models

Each model implements the `MotionModel` trait:

```rust
pub trait MotionModel: Send + Sync {
    fn predict(&self, state: &DVector<f64>, dt: f64) -> DVector<f64>;
    fn jacobian(&self, state: &DVector<f64>, dt: f64) -> DMatrix<f64>;
    fn process_noise(&self, dt: f64) -> DMatrix<f64>;
}
```

### Constant Velocity

Assumes no acceleration — straight-line motion at constant speed:

```
x(t+dt) = x(t) + vx·dt
y(t+dt) = y(t) + vy·dt
z(t+dt) = z(t) + vz·dt
```

Process noise: low (expects stable trajectory).

### Constant Acceleration

Adds acceleration terms estimated from velocity changes:

```
x(t+dt) = x(t) + vx·dt + 0.5·ax·dt²
vx(t+dt) = vx(t) + ax·dt
```

Process noise: moderate (expects some maneuver).

### Coordinated Turn

Models a banked turn using the turn rate `ω`:

```
x(t+dt) = x(t) + sin(ω·dt)/ω · vx - (1-cos(ω·dt))/ω · vy
y(t+dt) = y(t) + (1-cos(ω·dt))/ω · vx + sin(ω·dt)/ω · vy
```

Process noise: high on `ω` (turn rate can change rapidly).

### Climb/Descend

Focuses on vertical motion with changing vertical rate:

```
z(t+dt) = z(t) + vz·dt + 0.5·az·dt²
```

Process noise: high on vertical acceleration.

## IMM Engine

The IMM combines all 4 motion models using a Markov transition matrix. At each update cycle:

### IMM Cycle

```
1. MIXING
   ├── Compute mixing probabilities from transition matrix
   └── Create mixed initial conditions for each model

2. PREDICT
   └── Each model's EKF predicts forward by dt

3. UPDATE
   ├── Each model's EKF updates with new measurement
   └── Compute per-model log-likelihood

4. PROBABILITY COMBINATION
   ├── Update model weights using likelihoods (log-sum-exp for stability)
   └── Normalize to sum to 1.0

5. OUTPUT
   ├── Weighted combination of all model states → combined state estimate
   └── Dominant model (highest weight) → used for trajectory prediction
```

### Transition Matrix

Default Markov transition probabilities:

```
              To: CV    CA    CT    CD
From:  CV  [ 0.85  0.05  0.05  0.05 ]
       CA  [ 0.05  0.80  0.10  0.05 ]
       CT  [ 0.05  0.10  0.80  0.05 ]
       CD  [ 0.05  0.05  0.05  0.85 ]
```

High self-persistence (80-85%) with 5% switch probability to each other model.

## Pattern Detection

After accumulating 30 minutes of history, the system detects behavioral patterns:

### Detection Priority

```
Orbit > CAP > Holding > Transit
```

### Orbit Detection

Uses the **Kasa circle-fitting method** on the position history:

1. Compute algebraic circle fit from (x, y) points
2. Validate: radius 2-150 km, RMS residual < 30% of radius
3. Outputs: center point, radius, angular velocity

### CAP (Combat Air Patrol) Detection

Detects back-and-forth patrol patterns via bimodal heading analysis:

1. Extract heading samples from velocity vectors
2. Run **k-means (k=2)** on the unit circle
3. Validate: heading gap between clusters is 140-220 degrees
4. Minimum 5 minutes of data required

### Transit Detection

Identifies straight-line flight segments:

1. Compute heading variance across the history buffer
2. If variance < 0.02 radians² over 5+ minutes → transit pattern
3. Indicates the aircraft is flying a straight course (likely en route)

### Holding Detection

Identifies holding/loitering patterns:

1. Compute the **straightness ratio**: displacement / total distance traveled
2. If ratio < 0.3 → the aircraft is circling or loitering
3. Distinguishes from orbit by failing the circle-fit validation

## PredictionService

The service layer manages per-aircraft tracking state:

```rust
pub struct PredictionService {
    trackers: HashMap<String, AircraftTracker>,
}

struct AircraftTracker {
    imm: ImmEngine,
    history: HistoryBuffer,  // 30-minute rolling buffer
    enu_origin: (f64, f64),  // lat, lon reference point
    pattern: Option<MilitaryPattern>,
}
```

### Update Cycle

For each military aircraft position:

1. **Convert** geodetic (lat, lon, alt) to ENU meters relative to the aircraft's origin
2. **Update** the IMM engine with the new measurement
3. **Append** to the history buffer
4. **Detect** patterns from history (if sufficient data)
5. **Generate** trajectory prediction (300s ahead, 5s steps)

### Stale Tracker Pruning

Trackers not updated for 120 seconds are automatically removed to free memory.

### Coordinate Conversion

Geodetic ↔ ENU uses flat-earth approximation:

```
dx = (lon - lon0) × 111,320 × cos(lat0)  meters
dy = (lat - lat0) × 111,320              meters
```

Sufficient accuracy within the ~50km prediction range.

## Trajectory Output

Each predicted trajectory contains:

```rust
pub struct PredictedTrajectory {
    pub icao: String,
    pub pattern: Option<MilitaryPattern>,
    pub points: Vec<PredictedPoint>,
}

pub struct PredictedPoint {
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
    pub dt_secs: f64,       // seconds from now
    pub sigma_xy_m: f64,    // horizontal uncertainty (meters)
    pub sigma_z_m: f64,     // vertical uncertainty (meters)
}
```

The dominant IMM model propagates the state forward in 5-second steps for 300 seconds, producing 60 predicted points with growing uncertainty ellipses.
