// Re-export PostgreSQL pool — replaces the old better-sqlite3 getDb() singleton.
// All callers use getPool() from this module for import compatibility.
export { getPool, closePool } from './pgClient';
