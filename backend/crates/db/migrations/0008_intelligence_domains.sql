CREATE TABLE IF NOT EXISTS seismic_events (
    observed_at timestamptz NOT NULL,
    earthquake_id text NOT NULL,
    title text NOT NULL,
    magnitude double precision NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    depth_km double precision NOT NULL,
    event_time timestamptz,
    url text,
    felt integer,
    tsunami boolean NOT NULL DEFAULT false,
    PRIMARY KEY (earthquake_id, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_seismic_events_observed_at_desc
    ON seismic_events (observed_at DESC);

CREATE TABLE IF NOT EXISTS fire_hotspots (
    observed_at timestamptz NOT NULL,
    fire_key text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    brightness double precision NOT NULL,
    confidence text NOT NULL,
    frp double precision NOT NULL,
    daynight text NOT NULL,
    acq_date text NOT NULL,
    acq_time text NOT NULL,
    satellite text NOT NULL,
    PRIMARY KEY (fire_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_fire_hotspots_observed_at_desc
    ON fire_hotspots (observed_at DESC);

CREATE TABLE IF NOT EXISTS gdelt_events (
    observed_at timestamptz NOT NULL,
    event_key text NOT NULL,
    url text NOT NULL,
    title text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    tone double precision NOT NULL,
    domain text NOT NULL,
    source_country text,
    image_url text,
    PRIMARY KEY (event_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_gdelt_events_observed_at_desc
    ON gdelt_events (observed_at DESC);

CREATE TABLE IF NOT EXISTS maritime_vessels (
    observed_at timestamptz NOT NULL,
    mmsi text NOT NULL,
    name text,
    imo text,
    vessel_type text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    speed_knots double precision,
    heading double precision,
    destination text,
    flag text,
    is_sanctioned boolean NOT NULL DEFAULT false,
    PRIMARY KEY (mmsi, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_maritime_vessels_observed_at_desc
    ON maritime_vessels (observed_at DESC);

CREATE TABLE IF NOT EXISTS cyber_threats (
    observed_at timestamptz NOT NULL,
    threat_key text NOT NULL,
    threat_id text,
    threat_type text NOT NULL,
    malware text,
    src_ip text NOT NULL,
    src_lat double precision NOT NULL,
    src_lon double precision NOT NULL,
    src_country text,
    dst_ip text,
    dst_lat double precision,
    dst_lon double precision,
    dst_country text,
    confidence smallint NOT NULL,
    first_seen timestamptz,
    PRIMARY KEY (threat_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_cyber_threats_observed_at_desc
    ON cyber_threats (observed_at DESC);

CREATE TABLE IF NOT EXISTS space_weather_snapshots (
    observed_at timestamptz PRIMARY KEY,
    kp_index double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS space_weather_aurora (
    observed_at timestamptz NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    probability smallint NOT NULL,
    PRIMARY KEY (observed_at, lat, lon)
);

CREATE TABLE IF NOT EXISTS space_weather_alerts (
    observed_at timestamptz NOT NULL,
    product_id text NOT NULL,
    issue_time text NOT NULL,
    message text NOT NULL,
    PRIMARY KEY (product_id, observed_at)
);

CREATE TABLE IF NOT EXISTS submarine_cables (
    cable_id text PRIMARY KEY,
    name text NOT NULL,
    length_km double precision,
    owners text,
    year text,
    coordinates_json text NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cable_landing_points (
    landing_point_id text PRIMARY KEY,
    name text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    country text,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS military_bases (
    base_key text PRIMARY KEY,
    name text NOT NULL,
    country text,
    branch text,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS nuclear_sites (
    site_key text PRIMARY KEY,
    name text NOT NULL,
    country text,
    site_type text,
    status text,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    capacity_mw double precision,
    updated_at timestamptz NOT NULL
);
