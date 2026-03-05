use crate::{error::DbError, models::NuclearSiteRow, pool::PgPool};

pub async fn upsert_nuclear_sites(pool: &PgPool, rows: &[NuclearSiteRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut affected = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO nuclear_sites (
                site_key, name, country, site_type, status, lat, lon, capacity_mw, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9
            )
            ON CONFLICT (site_key) DO UPDATE
                SET name = EXCLUDED.name,
                    country = EXCLUDED.country,
                    site_type = EXCLUDED.site_type,
                    status = EXCLUDED.status,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    capacity_mw = EXCLUDED.capacity_mw,
                    updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(&row.site_key)
        .bind(&row.name)
        .bind(&row.country)
        .bind(&row.site_type)
        .bind(&row.status)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.capacity_mw)
        .bind(row.updated_at)
        .execute(pool)
        .await?;

        affected += result.rows_affected();
    }

    Ok(affected)
}
