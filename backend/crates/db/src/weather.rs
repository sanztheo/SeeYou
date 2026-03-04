use crate::{error::DbError, models::WeatherReadingRow, pool::PgPool};

const BATCH_SIZE: usize = 1000;

pub async fn insert_readings(pool: &PgPool, rows: &[WeatherReadingRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;

    for chunk in rows.chunks(BATCH_SIZE) {
        let observed_at: Vec<_> = chunk.iter().map(|r| r.observed_at).collect();
        let station_id: Vec<_> = chunk.iter().map(|r| r.station_id.clone()).collect();
        let city: Vec<_> = chunk.iter().map(|r| r.city.clone()).collect();
        let lat: Vec<_> = chunk.iter().map(|r| r.lat).collect();
        let lon: Vec<_> = chunk.iter().map(|r| r.lon).collect();
        let temp_c: Vec<_> = chunk.iter().map(|r| r.temp_c).collect();
        let wind_kt: Vec<_> = chunk.iter().map(|r| r.wind_kt).collect();
        let visibility_m: Vec<_> = chunk.iter().map(|r| r.visibility_m).collect();
        let conditions: Vec<_> = chunk.iter().map(|r| r.conditions.clone()).collect();

        let result = sqlx::query(
            r#"
            INSERT INTO weather_readings (
                observed_at, station_id, city, lat, lon, temp_c, wind_kt, visibility_m, conditions
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
                $9::text[]
            )
            ON CONFLICT (station_id, observed_at) DO NOTHING
            "#,
        )
        .bind(&observed_at)
        .bind(&station_id)
        .bind(&city)
        .bind(&lat)
        .bind(&lon)
        .bind(&temp_c)
        .bind(&wind_kt)
        .bind(&visibility_m)
        .bind(&conditions)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
