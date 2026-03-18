import type { Pool } from 'pg';
import { pgMigrations } from './migrations/pgMigrations';

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         TEXT   PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const { rows } = await pool.query('SELECT id FROM migrations');
  const applied = new Set(rows.map((r: { id: string }) => r.id));

  for (const migration of pgMigrations) {
    if (applied.has(migration.id)) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await migration.up(pool);
      await client.query(
        'INSERT INTO migrations (id, applied_at) VALUES ($1, $2)',
        [migration.id, Date.now()],
      );
      await client.query('COMMIT');
      process.stdout.write(`[migrate] applied: ${migration.id}\n`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
