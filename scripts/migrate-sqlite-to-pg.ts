/**
 * One-time migration: SQLite → PostgreSQL
 * Usage: ts-node -P tsconfig.scripts.json scripts/migrate-sqlite-to-pg.ts \
 *          --sqlite ./asphodel.db --pg postgresql://asphodel:...@localhost:5432/asphodel
 */
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { applySchema } from '../src/db/pgSchema';

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const SQLITE_PATH = getArg('--sqlite') ?? './asphodel.db';
const PG_URL      = getArg('--pg') ?? process.env['DATABASE_URL'];

if (!PG_URL) {
  process.stderr.write('Error: --pg <url> or DATABASE_URL required\n');
  process.exit(1);
}

// Tables in FK-safe order
const TABLES = [
  'souls',
  'wallets',
  'transactions',
  'reward_history',
  'quirks',
  'browser_sessions',
  'world_log',
  'world_milestones',
  'soul_memory',
  'directives',
  'soul_positions',
  'ghost_posts',
  'social_posts',
  'stripe_accounts',
  'library_works',
  'soul_goals',
  'action_registry',
  'world_objects',
  'joint_ventures',
  'venture_proposals',
  'migrations',
] as const;

// JSONB columns per table — pg serialises JS objects automatically
const JSONB_COLS: Record<string, string[]> = {
  souls:           ['identity', 'vitals', 'reward_weights'],
  reward_history:  ['quirk_delta'],
  soul_memory:     ['metadata'],
  world_log:       ['metadata'],
  world_milestones:['metadata'],
  ghost_posts:     ['metadata'],
  social_posts:    ['metadata'],
  library_works:   ['metadata'],
  action_registry: ['vitals_effect', 'prerequisites'],
  world_objects:   ['properties'],
  joint_ventures:  ['reward_split'],
  soul_goals:      ['sub_goals', 'progress_notes'],
};

// Boolean columns per table (stored as 0/1 in SQLite)
const BOOL_COLS: Record<string, string[]> = {
  souls:           ['is_active'],
  quirks:          ['seeded', 'persisted'],
  directives:      ['injected'],
  action_registry: ['is_collaborative'],
};

// Tables with BIGSERIAL primary key (need setval after insert)
const BIGSERIAL_TABLES = new Set([
  'reward_history',
  'world_log',
  'world_milestones',
  'soul_memory',
  'library_works',
]);

async function main(): Promise<void> {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool   = new Pool({ connectionString: PG_URL });

  process.stdout.write(`[migrate] SQLite: ${SQLITE_PATH}\n`);
  process.stdout.write(`[migrate] PostgreSQL: ${PG_URL!.replace(/:([^@]+)@/, ':***@')}\n\n`);

  // Apply schema (idempotent DDL)
  await applySchema(pool);
  process.stdout.write('[migrate] Schema applied.\n\n');

  const client = await pool.connect();

  for (const table of TABLES) {
    // Check if table exists in SQLite
    const tableExists = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    ).get(table);
    if (!tableExists) {
      process.stdout.write(`[migrate] ${table}: not in SQLite — skipping\n`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      process.stdout.write(`[migrate] ${table}: 0 rows — skipping\n`);
      continue;
    }

    const jsonbCols = new Set(JSONB_COLS[table] ?? []);
    const boolCols  = new Set(BOOL_COLS[table] ?? []);
    const cols      = Object.keys(rows[0]!).filter(c => c !== 'embedding'); // embedding is NULL initially

    await client.query('BEGIN');
    try {
      let inserted = 0;
      for (const row of rows) {
        const values = cols.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return null;
          if (boolCols.has(col))  return Boolean((val as number) !== 0);
          if (jsonbCols.has(col)) return typeof val === 'string' ? JSON.parse(val as string) : val;
          return val;
        });

        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        inserted++;
      }

      // Reset BIGSERIAL sequence
      if (BIGSERIAL_TABLES.has(table)) {
        await client.query(
          `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
        );
      }

      await client.query('COMMIT');
      process.stdout.write(`[migrate] ${table}: ${inserted}/${rows.length} rows\n`);
    } catch (err) {
      await client.query('ROLLBACK');
      process.stderr.write(`[migrate] ${table}: ERROR — ${String(err)}\n`);
    }
  }

  client.release();
  await pool.end();
  sqlite.close();
  process.stdout.write('\n[migrate] Done.\n');
}

main().catch(err => {
  process.stderr.write(`[fatal] ${String(err)}\n`);
  process.exit(1);
});
