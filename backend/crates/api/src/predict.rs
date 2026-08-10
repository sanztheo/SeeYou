use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use prediction::service::SharedPredictor;
use prediction::PredictedTrajectory;
use serde::Deserialize;

/// Mirrors `prediction::service`'s broadcast horizon/step — used only as
/// the default when a caller omits the query params.
const DEFAULT_HORIZON_SECS: f64 = 300.0;
const DEFAULT_STEP_SECS: f64 = 5.0;

#[derive(Debug, Deserialize)]
pub struct PredictQuery {
    horizon: Option<f64>,
    step: Option<f64>,
}

/// GET /aircraft/:icao/predict?horizon=&step= — full-resolution trajectory
/// on demand. A military aircraft with IMM state gets `model: "imm"`;
/// anything else falls back to a `"cv_coldstart"` straight-line + vertical-rate
/// projection from its last known kinematics (see
/// `PredictionService::get_trajectory`).
pub async fn predict_aircraft(
    Path(icao): Path<String>,
    Query(query): Query<PredictQuery>,
    State(predictor): State<SharedPredictor>,
) -> Result<Json<PredictedTrajectory>, StatusCode> {
    let horizon = query.horizon.unwrap_or(DEFAULT_HORIZON_SECS);
    let step = query.step.unwrap_or(DEFAULT_STEP_SECS);
    if horizon <= 0.0 || step <= 0.0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let guard = predictor.read().await;
    guard
        .get_trajectory(&icao, horizon, step)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

#[cfg(test)]
mod tests {
    use super::*;
    use prediction::service::{AircraftMeasurement, PredictionService};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn measurement(icao: &str, is_military: bool) -> AircraftMeasurement {
        AircraftMeasurement {
            icao: icao.to_string(),
            lat: 48.0,
            lon: 2.0,
            alt_m: 8000.0,
            speed_ms: 200.0,
            heading_deg: 90.0,
            vertical_rate_ms: 0.0,
            is_military,
            on_ground: false,
        }
    }

    async fn predictor_with(measurements: &[AircraftMeasurement]) -> SharedPredictor {
        let mut svc = PredictionService::new();
        svc.process_batch(measurements);
        Arc::new(RwLock::new(svc))
    }

    #[tokio::test]
    async fn predict_aircraft_returns_imm_for_tracked_military() {
        let predictor = predictor_with(&[measurement("mil1", true)]).await;

        let result = predict_aircraft(
            Path("mil1".to_string()),
            Query(PredictQuery {
                horizon: None,
                step: None,
            }),
            State(predictor),
        )
        .await;

        let trajectory = result.expect("expected a trajectory").0;
        assert_eq!(trajectory.model, "imm");
        assert!(!trajectory.points.is_empty());
    }

    #[tokio::test]
    async fn predict_aircraft_returns_cold_start_for_civilian() {
        let predictor = predictor_with(&[measurement("civ1", false)]).await;

        let result = predict_aircraft(
            Path("civ1".to_string()),
            Query(PredictQuery {
                horizon: Some(120.0),
                step: Some(30.0),
            }),
            State(predictor),
        )
        .await;

        let trajectory = result.expect("expected a trajectory").0;
        assert_eq!(trajectory.model, "cv_coldstart");
        assert_eq!(trajectory.points.len(), 4); // 120s / 30s
    }

    #[tokio::test]
    async fn predict_aircraft_404s_for_unknown_icao() {
        let predictor = predictor_with(&[measurement("mil1", true)]).await;

        let result = predict_aircraft(
            Path("ghost".to_string()),
            Query(PredictQuery {
                horizon: None,
                step: None,
            }),
            State(predictor),
        )
        .await;

        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn predict_aircraft_rejects_non_positive_horizon() {
        let predictor = predictor_with(&[measurement("mil1", true)]).await;

        let result = predict_aircraft(
            Path("mil1".to_string()),
            Query(PredictQuery {
                horizon: Some(0.0),
                step: None,
            }),
            State(predictor),
        )
        .await;

        assert_eq!(result.unwrap_err(), StatusCode::BAD_REQUEST);
    }
}
