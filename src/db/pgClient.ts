import { Pool, types } from 'pg';

// Parse BIGINT/BIGSERIAL (INT8) as JS number instead of string
types.setTypeParser(types.builtins.INT8, (val: string) => Number(val));

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 10,
    });
    _pool.on('error', (err) => {
      process.stderr.write(`[PG] Idle client error: ${err.message}\n`);
    });
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
