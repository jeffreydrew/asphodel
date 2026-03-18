import type { Pool } from 'pg';

export interface Migration {
  id: string;
  up: (pool: Pool) => Promise<void>;
}

/**
 * Add new migrations to the END of this array — never reorder or edit existing entries.
 * Each migration runs exactly once per database (dev and prod independently).
 *
 * When to add a migration:
 *   - You added a column to an existing table in pgSchema.ts
 *   - You renamed a column or changed a constraint
 *   - You need to backfill data after a structural change
 *   NOT needed for:
 *   - Brand-new tables (pgSchema.ts CREATE TABLE IF NOT EXISTS handles that)
 *
 * Example:
 *   {
 *     id: '002_add_mood_to_souls',
 *     up: async (pool) => {
 *       await pool.query(`ALTER TABLE souls ADD COLUMN IF NOT EXISTS mood TEXT NOT NULL DEFAULT 'neutral'`);
 *     },
 *   },
 */
export const pgMigrations: Migration[] = [
  // --- migrations will go here ---
];
