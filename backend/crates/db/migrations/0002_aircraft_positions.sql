CREATE TABLE IF NOT EXISTS aircraft_positions (
    observed_at timestamptz NOT NULL,
    icao text NOT NULL,
    callsign text,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    altitude_m double precision NOT NULL,
    speed_ms double precision NOT NULL,
    heading_deg double precision NOT NULL,
    vertical_rate_ms double precision,
    on_ground boolean NOT NULL DEFAULT false,
    is_military boolean NOT NULL DEFAULT false,
    PRIMARY KEY (icao, observed_at)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE $q$
            SELECT create_hypertable(
                'aircraft_positions',
                'observed_at',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
        $q$;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_aircraft_positions_observed_at_desc
    ON aircraft_positions (observed_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE $q$
            ALTER TABLE aircraft_positions
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
            ) STORED
        $q$;

        EXECUTE $q$
            CREATE INDEX IF NOT EXISTS idx_aircraft_positions_geom_gist
                ON aircraft_positions USING GIST (geom)
        $q$;
    END IF;
END
$$;
