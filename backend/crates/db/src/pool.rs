use crate::error::DbError;

pub type PgPool = sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> Result<PgPool, DbError> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn ping_postgres(pool: &PgPool) -> Result<(), DbError> {
    sqlx::query("SELECT 1").execute(pool).await?;
    Ok(())
}
