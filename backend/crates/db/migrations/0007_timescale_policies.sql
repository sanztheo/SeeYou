DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE $q$
            ALTER TABLE aircraft_positions SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'icao',
                timescaledb.compress_orderby = 'observed_at DESC'
            )
        $q$;

        EXECUTE $q$
            ALTER TABLE traffic_segments SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'segment_id',
                timescaledb.compress_orderby = 'observed_at DESC'
            )
        $q$;

        EXECUTE $q$
            ALTER TABLE weather_readings SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'station_id',
                timescaledb.compress_orderby = 'observed_at DESC'
            )
        $q$;

        EXECUTE $q$
            SELECT add_compression_policy('aircraft_positions', INTERVAL '7 days', if_not_exists => TRUE)
        $q$;
        EXECUTE $q$
            SELECT add_compression_policy('traffic_segments', INTERVAL '7 days', if_not_exists => TRUE)
        $q$;
        EXECUTE $q$
            SELECT add_compression_policy('weather_readings', INTERVAL '7 days', if_not_exists => TRUE)
        $q$;

        EXECUTE $q$
            SELECT add_retention_policy('aircraft_positions', INTERVAL '90 days', if_not_exists => TRUE)
        $q$;
        EXECUTE $q$
            SELECT add_retention_policy('traffic_segments', INTERVAL '90 days', if_not_exists => TRUE)
        $q$;
        EXECUTE $q$
            SELECT add_retention_policy('weather_readings', INTERVAL '90 days', if_not_exists => TRUE)
        $q$;
    END IF;
END
$$;
