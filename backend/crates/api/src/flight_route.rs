use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::Value;
use tracing::{debug, warn};

/// adsb.lol serves no `Access-Control-Allow-Origin`, so the browser cannot reach
/// this itself -- the lookup has to be relayed from the server.
///
/// This is the `/api/0/route/{callsign}` endpoint, which 302s to the VRS
/// standing-data file that actually holds the route. The older
/// `/api/0/routeset` POST still answers 201 but with an empty `text/html`
/// body, so it cannot be used any more.
const ROUTE_URL_BASE: &str = "https://api.adsb.lol/api/0/route";

/// GET /flight-route/:callsign -- relays the lookup and returns the upstream
/// JSON untouched, leaving the parsing with the frontend that already owns it.
pub async fn lookup_flight_route(
    State(client): State<reqwest::Client>,
    Path(callsign): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let callsign = callsign.trim().to_uppercase();
    if callsign.is_empty() || !callsign.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let response = client
        .get(format!("{ROUTE_URL_BASE}/{callsign}"))
        .send()
        .await
        .map_err(|error| {
            warn!(%callsign, %error, "route lookup failed");
            StatusCode::BAD_GATEWAY
        })?;

    // Unknown callsigns are a normal outcome, not an upstream failure.
    if response.status() == StatusCode::NOT_FOUND {
        debug!(%callsign, "no published route");
        return Err(StatusCode::NOT_FOUND);
    }

    let status = response.status();
    if !status.is_success() {
        warn!(%callsign, %status, "route lookup returned a non-success status");
        return Err(StatusCode::BAD_GATEWAY);
    }

    match response.json::<Value>().await {
        Ok(payload) => {
            debug!(%callsign, "route relayed");
            Ok(Json(payload))
        }
        // An empty or non-JSON body means the callsign has no route on file.
        Err(_) => {
            debug!(%callsign, "route body was not JSON, treating as unknown callsign");
            Err(StatusCode::NOT_FOUND)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_accepted(raw: &str) -> bool {
        let callsign = raw.trim().to_uppercase();
        !callsign.is_empty() && callsign.chars().all(|c| c.is_ascii_alphanumeric())
    }

    #[test]
    fn accepts_a_normal_callsign() {
        assert!(is_accepted("  afr11 "));
        assert!(is_accepted("UAL1"));
    }

    #[test]
    fn rejects_blank_callsigns() {
        for raw in ["", "   ", "\t"] {
            assert!(!is_accepted(raw));
        }
    }

    #[test]
    fn rejects_callsigns_that_could_escape_the_path() {
        for raw in ["../secrets", "AFR11/../..", "AFR 11", "AFR%2F11"] {
            assert!(!is_accepted(raw), "{raw} should be rejected");
        }
    }
}
