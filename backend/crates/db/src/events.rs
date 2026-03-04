use crate::{error::DbError, models::EventRow, pool::PgPool};

const BATCH_SIZE: usize = 1000;

pub async fn insert_events(pool: &PgPool, rows: &[EventRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;

    for chunk in rows.chunks(BATCH_SIZE) {
        let observed_at: Vec<_> = chunk.iter().map(|r| r.observed_at).collect();
        let event_id: Vec<_> = chunk.iter().map(|r| r.event_id.clone()).collect();
        let event_type: Vec<_> = chunk.iter().map(|r| r.event_type.clone()).collect();
        let lat: Vec<_> = chunk.iter().map(|r| r.lat).collect();
        let lon: Vec<_> = chunk.iter().map(|r| r.lon).collect();
        let severity: Vec<_> = chunk.iter().map(|r| r.severity).collect();
        let description: Vec<_> = chunk.iter().map(|r| r.description.clone()).collect();
        let source_url: Vec<_> = chunk.iter().map(|r| r.source_url.clone()).collect();

        let result = sqlx::query(
            r#"
            INSERT INTO events (
                observed_at, event_id, event_type, lat, lon, severity, description, source_url
            )
            SELECT *
            FROM UNNEST(
                $1::timestamptz[],
                $2::text[],
                $3::text[],
                $4::double precision[],
                $5::double precision[],
                $6::smallint[],
                $7::text[],
                $8::text[]
            )
            ON CONFLICT (event_id, observed_at) DO NOTHING
            "#,
        )
        .bind(&observed_at)
        .bind(&event_id)
        .bind(&event_type)
        .bind(&lat)
        .bind(&lon)
        .bind(&severity)
        .bind(&description)
        .bind(&source_url)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
