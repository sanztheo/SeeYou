CREATE TABLE IF NOT EXISTS traffic_segments (
    observed_at timestamptz NOT NULL,
    segment_id text NOT NULL,
    road_name text,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    speed_ratio double precision NOT NULL,
    delay_min double precision NOT NULL,
    severity smallint NOT NULL,
    PRIMARY KEY (segment_id, observed_at)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE $q$
            SELECT create_hypertable(
                'traffic_segments',
                'observed_at',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
        $q$;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_traffic_segments_observed_at_desc
    ON traffic_segments (observed_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE $q$
            ALTER TABLE traffic_segments
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
            ) STORED
        $q$;

        EXECUTE $q$
            CREATE INDEX IF NOT EXISTS idx_traffic_segments_geom_gist
                ON traffic_segments USING GIST (geom)
        $q$;
    END IF;
END
$$;
