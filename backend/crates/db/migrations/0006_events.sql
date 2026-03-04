CREATE TABLE IF NOT EXISTS events (
    observed_at timestamptz NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    severity smallint NOT NULL,
    description text NOT NULL,
    source_url text,
    PRIMARY KEY (event_id, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_events_observed_at_desc
    ON events (observed_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE $q$
            ALTER TABLE events
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
            ) STORED
        $q$;

        EXECUTE $q$
            CREATE INDEX IF NOT EXISTS idx_events_geom_gist
                ON events USING GIST (geom)
        $q$;
    END IF;
END
$$;
