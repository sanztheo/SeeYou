use std::time::Duration;

use crate::types::Camera;

const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);

/// Check if a camera URL is reachable. Tries HEAD first, falls back to
/// a range-limited GET (many servers reject HEAD but accept GET).
pub async fn check_camera_health(client: &reqwest::Client, camera: &Camera) -> bool {
    let head = client
        .head(&camera.stream_url)
        .header("User-Agent", "Mozilla/5.0 (compatible; SeeYou/1.0)")
        .timeout(HEALTH_CHECK_TIMEOUT)
        .send()
        .await;

    if let Ok(resp) = head {
        if resp.status().is_success() {
            return true;
        }
    }

    // HEAD failed — try GET with Range to avoid downloading the whole body
    let get = client
        .get(&camera.stream_url)
        .header("User-Agent", "Mozilla/5.0 (compatible; SeeYou/1.0)")
        .header("Range", "bytes=0-0")
        .timeout(HEALTH_CHECK_TIMEOUT)
        .send()
        .await;

    match get {
        Ok(resp) => {
            let s = resp.status();
            s.is_success() || s.as_u16() == 206
        }
        Err(_) => false,
    }
}

/// Check every camera concurrently and set `is_online` accordingly.
pub async fn check_batch_health(client: &reqwest::Client, cameras: Vec<Camera>) -> Vec<Camera> {
    let handles: Vec<_> = cameras
        .into_iter()
        .map(|cam| {
            let c = client.clone();
            tokio::spawn(async move {
                let online = check_camera_health(&c, &cam).await;
                Camera {
                    is_online: online,
                    ..cam
                }
            })
        })
        .collect();

    let mut result = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(cam) = handle.await {
            result.push(cam);
        }
    }
    result
}
