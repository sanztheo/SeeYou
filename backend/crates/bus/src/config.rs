use rdkafka::ClientConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BusFallbackMode {
    RedisPostgres,
    Drop,
    Log,
}

impl BusFallbackMode {
    pub fn from_env_value(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "redis_postgres" | "redis+postgres" | "redis-postgres" => Self::RedisPostgres,
            "drop" => Self::Drop,
            _ => Self::Log,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BusSettings {
    pub brokers: String,
    pub schema_registry_url: Option<String>,
    pub enabled: bool,
    pub fallback_mode: BusFallbackMode,
}

impl BusSettings {
    pub fn from_env() -> Self {
        let brokers = resolve_brokers_from_env();

        let schema_registry_url = std::env::var("SCHEMA_REGISTRY_URL")
            .ok()
            .filter(|value| !value.trim().is_empty());

        let enabled = std::env::var("BUS_ENABLED")
            .map(|value| {
                matches!(
                    value.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false);

        let fallback_mode = std::env::var("BUS_FALLBACK_MODE")
            .map(|value| BusFallbackMode::from_env_value(&value))
            .unwrap_or(BusFallbackMode::RedisPostgres);

        Self {
            brokers,
            schema_registry_url,
            enabled,
            fallback_mode,
        }
    }
}

pub fn resolve_brokers_from_env() -> String {
    let primary = first_non_empty(&["REDPANDA_BROKERS", "REDPANDA_URL"]);
    let internal = first_non_empty(&["REDPANDA_BROKERS_INTERNAL", "REDPANDA_INTERNAL_BROKERS"]);
    let public = first_non_empty(&["REDPANDA_BROKERS_PUBLIC", "REDPANDA_PUBLIC_BROKERS"]);

    let selected = if running_inside_railway() {
        primary.or(internal).or(public)
    } else if let Some(primary_brokers) = primary {
        if looks_like_railway_internal(&primary_brokers) {
            public.or(Some(primary_brokers))
        } else {
            Some(primary_brokers)
        }
    } else {
        public.or(internal)
    };

    selected
        .map(|value| normalize_broker_list(&value))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "127.0.0.1:9092".to_string())
}

pub fn apply_kafka_security_from_env(config: &mut ClientConfig) -> &mut ClientConfig {
    apply_optional_env(config, "REDPANDA_SECURITY_PROTOCOL", "security.protocol");
    apply_optional_env(config, "REDPANDA_SASL_MECHANISM", "sasl.mechanism");
    apply_optional_env(config, "REDPANDA_SASL_USERNAME", "sasl.username");
    apply_optional_env(config, "REDPANDA_SASL_PASSWORD", "sasl.password");
    apply_optional_env(config, "REDPANDA_SSL_CA_LOCATION", "ssl.ca.location");
    apply_optional_env(
        config,
        "REDPANDA_SSL_CERT_LOCATION",
        "ssl.certificate.location",
    );
    apply_optional_env(config, "REDPANDA_SSL_KEY_LOCATION", "ssl.key.location");
    apply_optional_env(config, "REDPANDA_SSL_KEY_PASSWORD", "ssl.key.password");
    config
}

fn apply_optional_env(config: &mut ClientConfig, env_key: &str, kafka_key: &str) {
    if let Some(value) = std::env::var(env_key)
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        config.set(kafka_key, &value);
    }
}

fn first_non_empty(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        std::env::var(key)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn running_inside_railway() -> bool {
    std::env::var("RAILWAY_PROJECT_ID").is_ok()
        || std::env::var("RAILWAY_SERVICE_ID").is_ok()
        || std::env::var("RAILWAY_ENVIRONMENT_ID").is_ok()
}

fn looks_like_railway_internal(raw: &str) -> bool {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .all(|value| {
            let host = host_from_broker_entry(value);
            host.ends_with(".railway.internal")
        })
}

fn host_from_broker_entry(value: &str) -> String {
    let without_creds = value.rsplit('@').next().unwrap_or(value);
    let with_possible_scheme = if without_creds.contains("://") {
        without_creds.to_string()
    } else {
        format!("kafka://{without_creds}")
    };

    match url::Url::parse(&with_possible_scheme) {
        Ok(parsed) => parsed.host_str().unwrap_or(without_creds).to_string(),
        Err(_) => without_creds
            .split(':')
            .next()
            .unwrap_or(without_creds)
            .to_string(),
    }
}

fn normalize_broker_list(raw: &str) -> String {
    raw.split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(normalize_broker_entry)
        .collect::<Vec<_>>()
        .join(",")
}

fn normalize_broker_entry(entry: &str) -> String {
    if !entry.contains("://") {
        return entry.to_string();
    }

    match url::Url::parse(entry) {
        Ok(parsed) => {
            let host = parsed.host_str().unwrap_or_default();
            if host.is_empty() {
                return entry.to_string();
            }
            match parsed.port() {
                Some(port) => format!("{host}:{port}"),
                None => host.to_string(),
            }
        }
        Err(_) => entry.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_brokers_from_env;
    use std::sync::{Mutex, OnceLock};

    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    const ENV_KEYS: &[&str] = &[
        "REDPANDA_BROKERS",
        "REDPANDA_URL",
        "REDPANDA_BROKERS_PUBLIC",
        "REDPANDA_PUBLIC_BROKERS",
        "REDPANDA_BROKERS_INTERNAL",
        "REDPANDA_INTERNAL_BROKERS",
        "RAILWAY_PROJECT_ID",
        "RAILWAY_SERVICE_ID",
        "RAILWAY_ENVIRONMENT_ID",
    ];

    fn with_isolated_env(vars: &[(&str, &str)], f: impl FnOnce()) {
        let guard = ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env lock poisoned");

        let previous: Vec<(&str, Option<String>)> = ENV_KEYS
            .iter()
            .map(|key| (*key, std::env::var(key).ok()))
            .collect();

        for key in ENV_KEYS {
            std::env::remove_var(key);
        }
        for (key, value) in vars {
            std::env::set_var(key, value);
        }

        f();

        for (key, value) in previous {
            match value {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }

        drop(guard);
    }

    #[test]
    fn defaults_to_localhost_when_unset() {
        with_isolated_env(&[], || {
            assert_eq!(resolve_brokers_from_env(), "127.0.0.1:9092");
        });
    }

    #[test]
    fn uses_legacy_redpanda_url_when_brokers_missing() {
        with_isolated_env(&[("REDPANDA_URL", "legacy.example:9092")], || {
            assert_eq!(resolve_brokers_from_env(), "legacy.example:9092");
        });
    }

    #[test]
    fn prefers_public_endpoint_outside_railway_for_internal_primary() {
        with_isolated_env(
            &[
                ("REDPANDA_BROKERS", "kafka.railway.internal:9092"),
                ("REDPANDA_BROKERS_PUBLIC", "public.kafka.example:19092"),
            ],
            || {
                assert_eq!(resolve_brokers_from_env(), "public.kafka.example:19092");
            },
        );
    }

    #[test]
    fn keeps_primary_inside_railway() {
        with_isolated_env(
            &[
                ("REDPANDA_BROKERS", "kafka.railway.internal:9092"),
                ("REDPANDA_BROKERS_PUBLIC", "public.kafka.example:19092"),
                ("RAILWAY_PROJECT_ID", "proj"),
            ],
            || {
                assert_eq!(resolve_brokers_from_env(), "kafka.railway.internal:9092");
            },
        );
    }

    #[test]
    fn normalizes_scheme_prefixed_brokers() {
        with_isolated_env(
            &[(
                "REDPANDA_BROKERS",
                "kafka://broker-a:9092,ssl://broker-b:9093",
            )],
            || {
                assert_eq!(resolve_brokers_from_env(), "broker-a:9092,broker-b:9093");
            },
        );
    }
}
