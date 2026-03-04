CREATE TABLE IF NOT EXISTS cameras (
    id text PRIMARY KEY,
    name text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    stream_type text NOT NULL,
    source text NOT NULL,
    is_online boolean NOT NULL,
    last_seen timestamptz NOT NULL,
    city text,
    country text,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cameras_last_seen_desc
    ON cameras (last_seen DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        EXECUTE $q$
            ALTER TABLE cameras
            ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
            GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
            ) STORED
        $q$;

        EXECUTE $q$
            CREATE INDEX IF NOT EXISTS idx_cameras_geom_gist
                ON cameras USING GIST (geom)
        $q$;
    END IF;
END
$$;
