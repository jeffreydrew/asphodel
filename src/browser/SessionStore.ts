import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/pgClient';
import type { BrowserSessionRow, SessionStatus } from '../types';

export class SessionStore {
  async upsert(
    soulId: string,
    platform: string,
    updates: Partial<BrowserSessionRow> = {},
  ): Promise<void> {
    const pool = getPool();
    const now  = Date.now();

    const { rows } = await pool.query(
      'SELECT * FROM browser_sessions WHERE soul_id = $1 AND platform = $2',
      [soulId, platform],
    );
    const existing = rows[0] as BrowserSessionRow | undefined;

    if (!existing) {
      await pool.query(
        `INSERT INTO browser_sessions
           (id, soul_id, platform, session_cookie, last_active, tasks_completed, abstract_earned_here, status)
         VALUES ($1, $2, $3, null, $4, 0, 0.0, 'active')`,
        [uuidv4(), soulId, platform, now],
      );
    } else {
      let paramCount = 1;
      const fields: string[] = [`last_active = $${paramCount++}`];
      const values: (string | number | null)[] = [now];

      if (updates.tasks_completed !== undefined) {
        fields.push(`tasks_completed = tasks_completed + $${paramCount++}`);
        values.push(updates.tasks_completed);
      }
      if (updates.abstract_earned_here !== undefined) {
        fields.push(`abstract_earned_here = abstract_earned_here + $${paramCount++}`);
        values.push(updates.abstract_earned_here);
      }
      if (updates.status) {
        fields.push(`status = $${paramCount++}`);
        values.push(updates.status);
      }

      values.push(soulId, platform);
      await pool.query(
        `UPDATE browser_sessions SET ${fields.join(', ')} WHERE soul_id = $${paramCount++} AND platform = $${paramCount}`,
        values,
      );
    }
  }

  async get(soulId: string, platform: string): Promise<BrowserSessionRow | null> {
    const { rows } = await getPool().query(
      'SELECT * FROM browser_sessions WHERE soul_id = $1 AND platform = $2',
      [soulId, platform],
    );
    return (rows[0] as BrowserSessionRow | undefined) ?? null;
  }

  async getAllForSoul(soulId: string): Promise<BrowserSessionRow[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM browser_sessions WHERE soul_id = $1',
      [soulId],
    );
    return rows as BrowserSessionRow[];
  }

  async setSuspended(soulId: string, platform: string): Promise<void> {
    await this.upsert(soulId, platform, { status: 'suspended' as SessionStatus });
  }
}

export const sessionStore = new SessionStore();
