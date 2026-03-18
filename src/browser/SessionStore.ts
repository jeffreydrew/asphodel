import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import type { BrowserSessionRow, SessionStatus } from '../types';

export class SessionStore {
  upsert(soulId: string, platform: string, updates: Partial<BrowserSessionRow> = {}): void {
    const db = getDb();
    const now = Date.now();

    const existing = db
      .prepare('SELECT * FROM browser_sessions WHERE soul_id = ? AND platform = ?')
      .get(soulId, platform) as BrowserSessionRow | undefined;

    if (!existing) {
      db.prepare(`
        INSERT INTO browser_sessions (id, soul_id, platform, session_cookie, last_active,
          tasks_completed, abstract_earned_here, status)
        VALUES (?, ?, ?, ?, ?, 0, 0.0, 'active')
      `).run(uuidv4(), soulId, platform, null, now);
    } else {
      const fields: string[] = ['last_active = ?'];
      const values: (string | number | null)[] = [now];

      if (updates.tasks_completed !== undefined) {
        fields.push('tasks_completed = tasks_completed + ?');
        values.push(updates.tasks_completed);
      }
      if (updates.abstract_earned_here !== undefined) {
        fields.push('abstract_earned_here = abstract_earned_here + ?');
        values.push(updates.abstract_earned_here);
      }
      if (updates.status) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      values.push(soulId, platform);
      db.prepare(`UPDATE browser_sessions SET ${fields.join(', ')} WHERE soul_id = ? AND platform = ?`)
        .run(...values);
    }
  }

  get(soulId: string, platform: string): BrowserSessionRow | null {
    return (
      (getDb()
        .prepare('SELECT * FROM browser_sessions WHERE soul_id = ? AND platform = ?')
        .get(soulId, platform) as BrowserSessionRow | undefined) ?? null
    );
  }

  getAllForSoul(soulId: string): BrowserSessionRow[] {
    return getDb()
      .prepare('SELECT * FROM browser_sessions WHERE soul_id = ?')
      .all(soulId) as BrowserSessionRow[];
  }

  setSuspended(soulId: string, platform: string): void {
    this.upsert(soulId, platform, { status: 'suspended' as SessionStatus });
  }
}

export const sessionStore = new SessionStore();
