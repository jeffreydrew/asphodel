import type Database from 'better-sqlite3';
import { migrations } from './migrations';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM migrations').all() as { id: string }[]).map(r => r.id),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        Date.now(),
      );
    })();

    process.stdout.write(`[migrate] applied: ${migration.id}\n`);
  }
}
