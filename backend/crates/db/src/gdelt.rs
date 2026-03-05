use crate::{error::DbError, models::GdeltEventRow, pool::PgPool};

pub async fn insert_gdelt_events(pool: &PgPool, rows: &[GdeltEventRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO gdelt_events (
                observed_at, event_key, url, title, lat, lon,
                tone, domain, source_country, image_url
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10
            )
            ON CONFLICT (event_key, observed_at) DO NOTHING
            "#,
        )
        .bind(row.observed_at)
        .bind(&row.event_key)
        .bind(&row.url)
        .bind(&row.title)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.tone)
        .bind(&row.domain)
        .bind(&row.source_country)
        .bind(&row.image_url)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
