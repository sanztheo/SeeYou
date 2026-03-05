use axum::{extract::State, http::StatusCode, Json};
use cache::RedisPool;

pub async fn get_satellites(
    State(pool): State<RedisPool>,
) -> Result<Json<Vec<satellites::Satellite>>, StatusCode> {
    match cache::satellites::get_satellites::<satellites::Satellite>(&pool).await {
        Ok(Some(data)) => Ok(Json(data)),
        Ok(None) => Ok(Json(Vec::new())),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
