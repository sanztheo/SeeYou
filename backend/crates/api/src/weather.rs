use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use cache::RedisPool;

pub async fn get_weather(
    State(pool): State<RedisPool>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match cache::weather::get_weather::<weather::WeatherGrid>(&pool).await {
        Ok(Some(grid)) => serde_json::to_value(grid)
            .map(Json)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR),
        Ok(None) => Err(StatusCode::SERVICE_UNAVAILABLE),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
