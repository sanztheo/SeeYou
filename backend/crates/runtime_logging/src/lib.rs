use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::Utc;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn init(service_name: &str, manifest_dir: &str) -> Result<WorkerGuard> {
    let repo_root = repo_root_from_manifest(manifest_dir);
    let log_dir = repo_root
        .join(".omx")
        .join("logs")
        .join("runtime")
        .join(service_name);
    fs::create_dir_all(&log_dir)
        .with_context(|| format!("failed to create runtime log dir {}", log_dir.display()))?;

    let file_name = format!("{service_name}-{}.log", Utc::now().format("%Y%m%dT%H%M%SZ"));
    let file_appender = tracing_appender::rolling::never(&log_dir, &file_name);
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
    let latest_path = log_dir.join("latest.log");
    let _ = fs::remove_file(&latest_path);
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        let _ = symlink(&file_name, &latest_path);
    }

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(fmt::layer().with_writer(std::io::stdout))
        .with(fmt::layer().with_ansi(false).with_writer(file_writer))
        .init();

    eprintln!(
        "runtime logs for {service_name}: {}",
        log_dir.join(file_name).display()
    );

    Ok(guard)
}

fn repo_root_from_manifest(manifest_dir: &str) -> PathBuf {
    Path::new(manifest_dir)
        .join("../../..")
        .canonicalize()
        .unwrap_or_else(|_| Path::new(manifest_dir).join("../../.."))
}
