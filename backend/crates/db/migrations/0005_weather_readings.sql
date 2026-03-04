CREATE TABLE IF NOT EXISTS weather_readings (
    observed_at timestamptz NOT NULL,
    station_id text NOT NULL,
    city text,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    temp_c double precision,
    wind_kt double precision,
    visibility_m double precision,
    conditions text,
    PRIMARY KEY (station_id, observed_at)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE $q$
            SELECT create_hypertable(
                'weather_readings',
                'observed_at',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
        $q$;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_weather_readings_observed_at_desc
    ON weather_readings (observed_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE $q$
            ALTER TABLE weather_readings
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
            ) STORED
        $q$;

        EXECUTE $q$
            CREATE INDEX IF NOT EXISTS idx_weather_readings_geom_gist
                ON weather_readings USING GIST (geom)
        $q$;
    END IF;
END
$$;
