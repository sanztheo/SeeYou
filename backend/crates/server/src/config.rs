const DEFAULT_HOST: &str = "0.0.0.0";
const DEFAULT_PORT: u16 = 3001;
const DEFAULT_REDIS_URL: &str = "redis://127.0.0.1:6379";
const DEFAULT_POLL_INTERVAL_SECS: u64 = 2;
const DEFAULT_CAMERA_POLL_INTERVAL_SECS: u64 = 300;
const DEFAULT_SATELLITE_POLL_INTERVAL_SECS: u64 = 60;

pub struct Config {
    pub host: String,
    pub port: u16,
    pub redis_url: String,
    pub poll_interval_secs: u64,
    pub camera_poll_interval_secs: u64,
    pub satellite_poll_interval_secs: u64,
}

impl Config {
    /// Read configuration from environment variables, falling back to
    /// sensible defaults for local development.
    pub fn from_env() -> Result<Self, anyhow::Error> {
        let host = std::env::var("SERVER_HOST").unwrap_or_else(|_| DEFAULT_HOST.into());

        let port = std::env::var("SERVER_PORT")
            .ok()
            .map(|v| v.parse::<u16>())
            .transpose()?
            .unwrap_or(DEFAULT_PORT);

        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| DEFAULT_REDIS_URL.into());

        let poll_interval_secs = std::env::var("POLL_INTERVAL_SECS")
            .ok()
            .map(|v| v.parse::<u64>())
            .transpose()?
            .unwrap_or(DEFAULT_POLL_INTERVAL_SECS);

        let camera_poll_interval_secs = std::env::var("CAMERA_POLL_INTERVAL_SECS")
            .ok()
            .map(|v| v.parse::<u64>())
            .transpose()?
            .unwrap_or(DEFAULT_CAMERA_POLL_INTERVAL_SECS);

        let satellite_poll_interval_secs = std::env::var("SATELLITE_POLL_INTERVAL_SECS")
            .ok()
            .map(|v| v.parse::<u64>())
            .transpose()?
            .unwrap_or(DEFAULT_SATELLITE_POLL_INTERVAL_SECS);

        Ok(Self {
            host,
            port,
            redis_url,
            poll_interval_secs,
            camera_poll_interval_secs,
            satellite_poll_interval_secs,
        })
    }
}
