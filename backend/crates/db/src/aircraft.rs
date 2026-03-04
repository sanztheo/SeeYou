use crate::{error::DbError, models::AircraftPositionRow, pool::PgPool};

const BATCH_SIZE: usize = 1000;

pub async fn insert_positions(pool: &PgPool, rows: &[AircraftPositionRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;

    for chunk in rows.chunks(BATCH_SIZE) {
        let observed_at: Vec<_> = chunk.iter().map(|r| r.observed_at).collect();
        let icao: Vec<_> = chunk.iter().map(|r| r.icao.clone()).collect();
        let callsign: Vec<_> = chunk.iter().map(|r| r.callsign.clone()).collect();
        let lat: Vec<_> = chunk.iter().map(|r| r.lat).collect();
        let lon: Vec<_> = chunk.iter().map(|r| r.lon).collect();
        let altitude_m: Vec<_> = chunk.iter().map(|r| r.altitude_m).collect();
        let speed_ms: Vec<_> = chunk.iter().map(|r| r.speed_ms).collect();
        let heading_deg: Vec<_> = chunk.iter().map(|r| r.heading_deg).collect();
        let vertical_rate_ms: Vec<_> = chunk.iter().map(|r| r.vertical_rate_ms).collect();
        let on_ground: Vec<_> = chunk.iter().map(|r| r.on_ground).collect();
        let is_military: Vec<_> = chunk.iter().map(|r| r.is_military).collect();

        let result = sqlx::query(
            r#"
            INSERT INTO aircraft_positions (
                observed_at, icao, callsign, lat, lon, altitude_m, speed_ms,
                heading_deg, vertical_rate_ms, on_ground, is_military
            )
            SELECT *
            FROM UNNEST(
                $1::timestamptz[],
                $2::text[],
                $3::text[],
                $4::double precision[],
                $5::double precision[],
                $6::double precision[],
                $7::double precision[],
                $8::double precision[],
                $9::double precision[],
                $10::boolean[],
                $11::boolean[]
            )
            ON CONFLICT (icao, observed_at) DO NOTHING
            "#,
        )
        .bind(&observed_at)
        .bind(&icao)
        .bind(&callsign)
        .bind(&lat)
        .bind(&lon)
        .bind(&altitude_m)
        .bind(&speed_ms)
        .bind(&heading_deg)
        .bind(&vertical_rate_ms)
        .bind(&on_ground)
        .bind(&is_military)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
