import Database from 'better-sqlite3';
import path from 'path';
import { applySchema } from './schema';
import { runMigrations } from './migrate';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'asphodel.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    applySchema(_db);
    runMigrations(_db);
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
