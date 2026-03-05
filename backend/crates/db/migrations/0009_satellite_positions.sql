CREATE TABLE IF NOT EXISTS satellite_positions (
    observed_at timestamptz NOT NULL,
    norad_id bigint NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    altitude_km double precision NOT NULL,
    velocity_km_s double precision NOT NULL,
    PRIMARY KEY (norad_id, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_satellite_positions_observed_at_desc
    ON satellite_positions (observed_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE $q$
            SELECT create_hypertable(
                'satellite_positions',
                'observed_at',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
        $q$;
    END IF;
END
$$;
