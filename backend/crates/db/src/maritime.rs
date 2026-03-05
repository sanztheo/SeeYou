use crate::{error::DbError, models::MaritimeVesselRow, pool::PgPool};

pub async fn insert_maritime_vessels(
    pool: &PgPool,
    rows: &[MaritimeVesselRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO maritime_vessels (
                observed_at, mmsi, name, imo, vessel_type, lat, lon,
                speed_knots, heading, destination, flag, is_sanctioned
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12
            )
            ON CONFLICT (mmsi, observed_at) DO NOTHING
            "#,
        )
        .bind(row.observed_at)
        .bind(&row.mmsi)
        .bind(&row.name)
        .bind(&row.imo)
        .bind(&row.vessel_type)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.speed_knots)
        .bind(row.heading)
        .bind(&row.destination)
        .bind(&row.flag)
        .bind(row.is_sanctioned)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
