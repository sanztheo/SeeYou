use axum::{extract::State, http::StatusCode, Json};

/// No Redis cache here (unlike `/gdelt`, `/maritime`): this endpoint fetches
/// GDACS live on every request rather than reading a tracker-populated
/// cache entry. GDACS's own feed is small (~1.1 MB) and already updates
/// every few minutes, and adding a cache module is out of this task's
/// exclusive perimeter (`backend/crates/cache/` isn't a file this task may
/// touch) — the graph-wiring requirement that *is* in scope is satisfied
/// separately by `server::main`'s tracker loop, which polls GDACS and
/// writes directly to the graph. This handler exists so the ingested data
/// is independently inspectable over REST, matching every other domain in
/// this app.
pub async fn get_disasters(
    State(client): State<reqwest::Client>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let disasters = disasters::gdacs::fetch_disasters(&client)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = disasters::DisastersResponse {
        disasters,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut payload =
        serde_json::to_value(response).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(list) = payload.get_mut("disasters").and_then(|v| v.as_array_mut()) {
        super::stable_ids::inject_stable_ids_in_array("disaster_event", list);
    }

    Ok(Json(payload))
}
