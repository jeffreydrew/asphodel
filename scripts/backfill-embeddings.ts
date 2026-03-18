/**
 * Post-migration: embed historical soul_memory rows where embedding IS NULL.
 * Rate-limited to 1/sec to avoid overwhelming Ollama.
 *
 * Usage: ts-node -P tsconfig.scripts.json scripts/backfill-embeddings.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { embedText } from '../src/db/embed';

const PG_URL = process.env['DATABASE_URL'];
if (!PG_URL) {
  process.stderr.write('Error: DATABASE_URL required\n');
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: PG_URL });

  const { rows } = await pool.query<{ id: number; content: string }>(
    `SELECT id, content FROM soul_memory WHERE embedding IS NULL ORDER BY id ASC`,
  );

  process.stdout.write(`[backfill] ${rows.length} rows need embedding\n`);

  let done = 0;
  let failed = 0;

  for (const row of rows) {
    const vec = await embedText(row.content);
    if (vec) {
      const vecStr = '[' + vec.join(',') + ']';
      await pool.query(
        `UPDATE soul_memory SET embedding = $1::vector WHERE id = $2`,
        [vecStr, row.id],
      );
      done++;
    } else {
      failed++;
      process.stderr.write(`[backfill] id=${row.id} embed failed — skipping\n`);
    }

    if ((done + failed) % 10 === 0) {
      process.stdout.write(`[backfill] ${done} embedded, ${failed} failed, ${rows.length - done - failed} remaining\n`);
    }

    await sleep(1000); // 1/sec rate limit
  }

  await pool.end();
  process.stdout.write(`[backfill] Done. ${done} embedded, ${failed} failed.\n`);
}

main().catch(err => {
  process.stderr.write(`[fatal] ${String(err)}\n`);
  process.exit(1);
});
