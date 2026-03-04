use crate::{error::DbError, models::TrafficSegmentRow, pool::PgPool};

const BATCH_SIZE: usize = 1000;

pub async fn insert_segments(pool: &PgPool, rows: &[TrafficSegmentRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;

    for chunk in rows.chunks(BATCH_SIZE) {
        let observed_at: Vec<_> = chunk.iter().map(|r| r.observed_at).collect();
        let segment_id: Vec<_> = chunk.iter().map(|r| r.segment_id.clone()).collect();
        let road_name: Vec<_> = chunk.iter().map(|r| r.road_name.clone()).collect();
        let lat: Vec<_> = chunk.iter().map(|r| r.lat).collect();
        let lon: Vec<_> = chunk.iter().map(|r| r.lon).collect();
        let speed_ratio: Vec<_> = chunk.iter().map(|r| r.speed_ratio).collect();
        let delay_min: Vec<_> = chunk.iter().map(|r| r.delay_min).collect();
        let severity: Vec<_> = chunk.iter().map(|r| r.severity).collect();

        let result = sqlx::query(
            r#"
            INSERT INTO traffic_segments (
                observed_at, segment_id, road_name, lat, lon, speed_ratio, delay_min, severity
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
                $8::smallint[]
            )
            ON CONFLICT (segment_id, observed_at) DO NOTHING
            "#,
        )
        .bind(&observed_at)
        .bind(&segment_id)
        .bind(&road_name)
        .bind(&lat)
        .bind(&lon)
        .bind(&speed_ratio)
        .bind(&delay_min)
        .bind(&severity)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
