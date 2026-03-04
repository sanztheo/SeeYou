use std::time::Duration;

use futures_util::stream::{self, StreamExt};

use crate::types::Camera;

const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(2);
const HEALTH_CHECK_CONCURRENCY: usize = 24;
const HEALTH_CHECK_SAMPLE_SIZE: usize = 1_500;

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

/// Health-check a bounded sample of cameras and set `is_online` accordingly.
pub async fn check_batch_health(client: &reqwest::Client, cameras: Vec<Camera>) -> Vec<Camera> {
    let mut to_check = Vec::with_capacity(cameras.len().min(HEALTH_CHECK_SAMPLE_SIZE));
    let mut passthrough =
        Vec::with_capacity(cameras.len().saturating_sub(HEALTH_CHECK_SAMPLE_SIZE));

    for (idx, cam) in cameras.into_iter().enumerate() {
        if idx < HEALTH_CHECK_SAMPLE_SIZE {
            to_check.push(cam);
        } else {
            passthrough.push(cam);
        }
    }

    let mut checked: Vec<Camera> = stream::iter(to_check.into_iter())
        .map(|cam| {
            let client = client.clone();
            async move {
                let online = check_camera_health(&client, &cam).await;
                Camera {
                    is_online: online,
                    ..cam
                }
            }
        })
        .buffer_unordered(HEALTH_CHECK_CONCURRENCY)
        .collect()
        .await;

    // Keep provider-reported status for the rest of the dataset; this avoids
    // exhausting file descriptors on machines with low `ulimit -n`.
    checked.extend(passthrough);
    checked
}
