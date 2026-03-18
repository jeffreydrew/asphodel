import type Database from 'better-sqlite3';

export interface Migration {
  id: string;
  up: (db: Database.Database) => void;
}

/**
 * Add new migrations to the END of this array — never reorder or edit existing entries.
 * Each migration runs exactly once per database (dev and prod independently).
 *
 * When to add a migration:
 *   - You added a column to an existing table in schema.ts
 *   - You renamed a column or changed a constraint
 *   - You need to backfill data after a structural change
 *   NOT needed for:
 *   - Brand-new tables (schema.ts CREATE TABLE IF NOT EXISTS handles that)
 *   - Anything you can get by deleting asphodel.db and reseeding locally
 *
 * Example:
 *   {
 *     id: '002_add_mood_to_souls',
 *     up: (db) => {
 *       db.exec(`ALTER TABLE souls ADD COLUMN mood TEXT NOT NULL DEFAULT 'neutral'`);
 *     },
 *   },
 */
export const migrations: Migration[] = [
  // --- migrations will go here ---
];
