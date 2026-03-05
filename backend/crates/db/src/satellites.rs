use crate::{error::DbError, models::SatellitePositionRow, pool::PgPool};

pub async fn insert_positions(
    pool: &PgPool,
    rows: &[SatellitePositionRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO satellite_positions (
                observed_at, norad_id, name, category, lat, lon, altitude_km, velocity_km_s
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8
            )
            ON CONFLICT (norad_id, observed_at) DO NOTHING
            "#,
        )
        .bind(row.observed_at)
        .bind(row.norad_id)
        .bind(&row.name)
        .bind(&row.category)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.altitude_km)
        .bind(row.velocity_km_s)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
