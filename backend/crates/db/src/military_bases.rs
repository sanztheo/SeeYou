use crate::{error::DbError, models::MilitaryBaseRow, pool::PgPool};

pub async fn upsert_military_bases(
    pool: &PgPool,
    rows: &[MilitaryBaseRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut affected = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO military_bases (
                base_key, name, country, branch, lat, lon, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7
            )
            ON CONFLICT (base_key) DO UPDATE
                SET name = EXCLUDED.name,
                    country = EXCLUDED.country,
                    branch = EXCLUDED.branch,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(&row.base_key)
        .bind(&row.name)
        .bind(&row.country)
        .bind(&row.branch)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.updated_at)
        .execute(pool)
        .await?;

        affected += result.rows_affected();
    }

    Ok(affected)
}
