const DEFAULT_HOST: &str = "0.0.0.0";
const DEFAULT_PORT: u16 = 3001;
const DEFAULT_REDIS_URL: &str = "redis://127.0.0.1:6379";
const DEFAULT_POLL_INTERVAL_SECS: u64 = 2;
const DEFAULT_CAMERA_POLL_INTERVAL_SECS: u64 = 300;
const DEFAULT_SATELLITE_POLL_INTERVAL_SECS: u64 = 60;
const DEFAULT_METAR_POLL_INTERVAL_SECS: u64 = 300;
const DEFAULT_WEATHER_POLL_INTERVAL_SECS: u64 = 600;
const DEFAULT_EVENTS_POLL_INTERVAL_SECS: u64 = 1800;
const DEFAULT_SEISMIC_POLL_INTERVAL_SECS: u64 = 300;
const DEFAULT_FIRES_POLL_INTERVAL_SECS: u64 = 1800;
const DEFAULT_CABLES_POLL_INTERVAL_SECS: u64 = 86400;
const DEFAULT_GDELT_POLL_INTERVAL_SECS: u64 = 900;
const DEFAULT_MARITIME_POLL_INTERVAL_SECS: u64 = 600;
const DEFAULT_CYBER_POLL_INTERVAL_SECS: u64 = 900;
const DEFAULT_SPACE_WEATHER_POLL_INTERVAL_SECS: u64 = 900;

pub struct Config {
    pub host: String,
    pub port: u16,
    pub redis_url: String,
    pub poll_interval_secs: u64,
    pub camera_poll_interval_secs: u64,
    pub satellite_poll_interval_secs: u64,
    pub metar_poll_interval_secs: u64,
    pub weather_poll_interval_secs: u64,
    pub events_poll_interval_secs: u64,
    pub seismic_poll_interval_secs: u64,
    pub fires_poll_interval_secs: u64,
    pub cables_poll_interval_secs: u64,
    pub gdelt_poll_interval_secs: u64,
    pub maritime_poll_interval_secs: u64,
    pub cyber_poll_interval_secs: u64,
    pub space_weather_poll_interval_secs: u64,
}

fn parse_env_u64(var: &str, default: u64) -> Result<u64, anyhow::Error> {
    std::env::var(var)
        .ok()
        .map(|v| v.parse::<u64>())
        .transpose()?
        .map_or(Ok(default), Ok)
}

impl Config {
    pub fn from_env() -> Result<Self, anyhow::Error> {
        let host = std::env::var("SERVER_HOST").unwrap_or_else(|_| DEFAULT_HOST.into());

        let port = std::env::var("SERVER_PORT")
            .ok()
            .map(|v| v.parse::<u16>())
            .transpose()?
            .unwrap_or(DEFAULT_PORT);

        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| DEFAULT_REDIS_URL.into());

        Ok(Self {
            host,
            port,
            redis_url,
            poll_interval_secs: parse_env_u64("POLL_INTERVAL_SECS", DEFAULT_POLL_INTERVAL_SECS)?,
            camera_poll_interval_secs: parse_env_u64("CAMERA_POLL_INTERVAL_SECS", DEFAULT_CAMERA_POLL_INTERVAL_SECS)?,
            satellite_poll_interval_secs: parse_env_u64("SATELLITE_POLL_INTERVAL_SECS", DEFAULT_SATELLITE_POLL_INTERVAL_SECS)?,
            metar_poll_interval_secs: parse_env_u64("METAR_POLL_INTERVAL_SECS", DEFAULT_METAR_POLL_INTERVAL_SECS)?,
            weather_poll_interval_secs: parse_env_u64("WEATHER_POLL_INTERVAL_SECS", DEFAULT_WEATHER_POLL_INTERVAL_SECS)?,
            events_poll_interval_secs: parse_env_u64("EVENTS_POLL_INTERVAL_SECS", DEFAULT_EVENTS_POLL_INTERVAL_SECS)?,
            seismic_poll_interval_secs: parse_env_u64("SEISMIC_POLL_INTERVAL_SECS", DEFAULT_SEISMIC_POLL_INTERVAL_SECS)?,
            fires_poll_interval_secs: parse_env_u64("FIRES_POLL_INTERVAL_SECS", DEFAULT_FIRES_POLL_INTERVAL_SECS)?,
            cables_poll_interval_secs: parse_env_u64("CABLES_POLL_INTERVAL_SECS", DEFAULT_CABLES_POLL_INTERVAL_SECS)?,
            gdelt_poll_interval_secs: parse_env_u64("GDELT_POLL_INTERVAL_SECS", DEFAULT_GDELT_POLL_INTERVAL_SECS)?,
            maritime_poll_interval_secs: parse_env_u64("MARITIME_POLL_INTERVAL_SECS", DEFAULT_MARITIME_POLL_INTERVAL_SECS)?,
            cyber_poll_interval_secs: parse_env_u64("CYBER_POLL_INTERVAL_SECS", DEFAULT_CYBER_POLL_INTERVAL_SECS)?,
            space_weather_poll_interval_secs: parse_env_u64("SPACE_WEATHER_POLL_INTERVAL_SECS", DEFAULT_SPACE_WEATHER_POLL_INTERVAL_SECS)?,
        })
    }
}
