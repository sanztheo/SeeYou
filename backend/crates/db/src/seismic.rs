use crate::{error::DbError, models::SeismicEventRow, pool::PgPool};

pub async fn insert_seismic_events(
    pool: &PgPool,
    rows: &[SeismicEventRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO seismic_events (
                observed_at, earthquake_id, title, magnitude, lat, lon, depth_km,
                event_time, url, felt, tsunami
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11
            )
            ON CONFLICT (earthquake_id, observed_at) DO NOTHING
            "#,
        )
        .bind(row.observed_at)
        .bind(&row.earthquake_id)
        .bind(&row.title)
        .bind(row.magnitude)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.depth_km)
        .bind(row.event_time)
        .bind(&row.url)
        .bind(row.felt)
        .bind(row.tsunami)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
