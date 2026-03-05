use crate::{
    error::DbError,
    models::{CableLandingPointRow, SubmarineCableRow},
    pool::PgPool,
};

pub async fn upsert_submarine_cables(
    pool: &PgPool,
    rows: &[SubmarineCableRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut affected = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO submarine_cables (
                cable_id, name, length_km, owners, year, coordinates_json, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7
            )
            ON CONFLICT (cable_id) DO UPDATE
                SET name = EXCLUDED.name,
                    length_km = EXCLUDED.length_km,
                    owners = EXCLUDED.owners,
                    year = EXCLUDED.year,
                    coordinates_json = EXCLUDED.coordinates_json,
                    updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(&row.cable_id)
        .bind(&row.name)
        .bind(row.length_km)
        .bind(&row.owners)
        .bind(&row.year)
        .bind(&row.coordinates_json)
        .bind(row.updated_at)
        .execute(pool)
        .await?;

        affected += result.rows_affected();
    }

    Ok(affected)
}

pub async fn upsert_landing_points(
    pool: &PgPool,
    rows: &[CableLandingPointRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut affected = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO cable_landing_points (
                landing_point_id, name, lat, lon, country, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6
            )
            ON CONFLICT (landing_point_id) DO UPDATE
                SET name = EXCLUDED.name,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon,
                    country = EXCLUDED.country,
                    updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(&row.landing_point_id)
        .bind(&row.name)
        .bind(row.lat)
        .bind(row.lon)
        .bind(&row.country)
        .bind(row.updated_at)
        .execute(pool)
        .await?;

        affected += result.rows_affected();
    }

    Ok(affected)
}
