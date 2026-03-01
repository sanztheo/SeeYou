use std::time::Duration;

use crate::types::Camera;

const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);

/// HEAD-request a single camera URL. Returns `true` if the server responds 2xx.
pub async fn check_camera_health(client: &reqwest::Client, camera: &Camera) -> bool {
    let result = client
        .head(&camera.stream_url)
        .timeout(HEALTH_CHECK_TIMEOUT)
        .send()
        .await;

    match result {
        Ok(resp) => resp.status().is_success(),
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
