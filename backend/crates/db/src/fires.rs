use crate::{error::DbError, models::FireHotspotRow, pool::PgPool};

pub async fn insert_fire_hotspots(pool: &PgPool, rows: &[FireHotspotRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO fire_hotspots (
                observed_at, fire_key, lat, lon, brightness, confidence,
                frp, daynight, acq_date, acq_time, satellite
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11
            )
            ON CONFLICT (fire_key, observed_at) DO NOTHING
            "#,
        )
        .bind(row.observed_at)
        .bind(&row.fire_key)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.brightness)
        .bind(&row.confidence)
        .bind(row.frp)
        .bind(&row.daynight)
        .bind(&row.acq_date)
        .bind(&row.acq_time)
        .bind(&row.satellite)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
