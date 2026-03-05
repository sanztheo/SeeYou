use crate::{
    error::DbError,
    models::{SpaceWeatherAlertRow, SpaceWeatherAuroraRow, SpaceWeatherSnapshotRow},
    pool::PgPool,
};

pub async fn insert_snapshot(pool: &PgPool, row: &SpaceWeatherSnapshotRow) -> Result<u64, DbError> {
    let result = sqlx::query(
        r#"
        INSERT INTO space_weather_snapshots (observed_at, kp_index)
        VALUES ($1, $2)
        ON CONFLICT (observed_at) DO NOTHING
        "#,
    )
    .bind(row.observed_at)
    .bind(row.kp_index)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

pub async fn insert_aurora_points(
    pool: &PgPool,
    rows: &[SpaceWeatherAuroraRow],
) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO space_weather_aurora (observed_at, lat, lon, probability)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (observed_at, lat, lon) DO UPDATE
                SET probability = EXCLUDED.probability
            "#,
        )
        .bind(row.observed_at)
        .bind(row.lat)
        .bind(row.lon)
        .bind(row.probability)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}

pub async fn insert_alerts(pool: &PgPool, rows: &[SpaceWeatherAlertRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO space_weather_alerts (observed_at, product_id, issue_time, message)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (product_id, observed_at) DO UPDATE
                SET issue_time = EXCLUDED.issue_time,
                    message = EXCLUDED.message
            "#,
        )
        .bind(row.observed_at)
        .bind(&row.product_id)
        .bind(&row.issue_time)
        .bind(&row.message)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
