use crate::{error::DbError, models::CameraRow, pool::PgPool};

const BATCH_SIZE: usize = 500;

pub async fn upsert_cameras(pool: &PgPool, rows: &[CameraRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut affected = 0_u64;

    for chunk in rows.chunks(BATCH_SIZE) {
        let id: Vec<_> = chunk.iter().map(|r| r.id.clone()).collect();
        let name: Vec<_> = chunk.iter().map(|r| r.name.clone()).collect();
        let lat: Vec<_> = chunk.iter().map(|r| r.lat).collect();
        let lon: Vec<_> = chunk.iter().map(|r| r.lon).collect();
        let stream_type: Vec<_> = chunk.iter().map(|r| r.stream_type.clone()).collect();
        let source: Vec<_> = chunk.iter().map(|r| r.source.clone()).collect();
        let is_online: Vec<_> = chunk.iter().map(|r| r.is_online).collect();
        let last_seen: Vec<_> = chunk.iter().map(|r| r.last_seen).collect();
        let city: Vec<_> = chunk.iter().map(|r| r.city.clone()).collect();
        let country: Vec<_> = chunk.iter().map(|r| r.country.clone()).collect();

        let result = sqlx::query(
            r#"
            INSERT INTO cameras (
                id, name, lat, lon, stream_type, source, is_online, last_seen, city, country
            )
            SELECT *
            FROM UNNEST(
                $1::text[],
                $2::text[],
                $3::double precision[],
                $4::double precision[],
                $5::text[],
                $6::text[],
                $7::boolean[],
                $8::timestamptz[],
                $9::text[],
                $10::text[]
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                stream_type = EXCLUDED.stream_type,
                source = EXCLUDED.source,
                is_online = EXCLUDED.is_online,
                last_seen = EXCLUDED.last_seen,
                city = EXCLUDED.city,
                country = EXCLUDED.country,
                updated_at = NOW()
            "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&lat)
        .bind(&lon)
        .bind(&stream_type)
        .bind(&source)
        .bind(&is_online)
        .bind(&last_seen)
        .bind(&city)
        .bind(&country)
        .execute(pool)
        .await?;

        affected += result.rows_affected();
    }

    Ok(affected)
}
