use crate::{error::DbError, models::CyberThreatRow, pool::PgPool};

pub async fn insert_cyber_threats(pool: &PgPool, rows: &[CyberThreatRow]) -> Result<u64, DbError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0_u64;
    for row in rows {
        let result = sqlx::query(
            r#"
            INSERT INTO cyber_threats (
                observed_at, threat_key, threat_id, threat_type, malware,
                src_ip, src_lat, src_lon, src_country, dst_ip,
                dst_lat, dst_lon, dst_country, confidence, first_seen
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15
            )
            ON CONFLICT (threat_key, observed_at) DO NOTHING
            "#,
        )
        .bind(row.observed_at)
        .bind(&row.threat_key)
        .bind(&row.threat_id)
        .bind(&row.threat_type)
        .bind(&row.malware)
        .bind(&row.src_ip)
        .bind(row.src_lat)
        .bind(row.src_lon)
        .bind(&row.src_country)
        .bind(&row.dst_ip)
        .bind(row.dst_lat)
        .bind(row.dst_lon)
        .bind(&row.dst_country)
        .bind(row.confidence)
        .bind(row.first_seen)
        .execute(pool)
        .await?;

        inserted += result.rows_affected();
    }

    Ok(inserted)
}
