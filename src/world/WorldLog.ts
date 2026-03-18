import { getDb } from '../db/client';
import { Significance } from '../types';
import type { WorldLogEntry, WorldMilestone } from '../types';

export class WorldLog {
  append(entry: Omit<WorldLogEntry, 'id'>): void {
    const db = getDb();

    db.prepare(`
      INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.soul_id,
      entry.significance,
      entry.action,
      entry.description,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.ts,
    );

    // Dual-write significant events to milestones
    if (entry.significance === Significance.SIGNIFICANT) {
      const milestone: Omit<WorldMilestone, 'id'> = {
        soul_id:     entry.soul_id,
        title:       entry.description.substring(0, 80),
        description: entry.description,
        ts:          entry.ts,
      };
      this.appendMilestone(milestone);
    }
  }

  appendMilestone(milestone: Omit<WorldMilestone, 'id'>): void {
    getDb().prepare(`
      INSERT INTO world_milestones (soul_id, title, description, ts)
      VALUES (?, ?, ?, ?)
    `).run(milestone.soul_id, milestone.title, milestone.description, milestone.ts);
  }

  getRecent(limit = 20): WorldLogEntry[] {
    const rows = getDb()
      .prepare('SELECT * FROM world_log ORDER BY ts DESC LIMIT ?')
      .all(limit) as Array<WorldLogEntry & { metadata: string | null }>;

    return rows.map(r => ({
      ...r,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
    }));
  }

  getMilestones(limit = 10): WorldMilestone[] {
    return getDb()
      .prepare('SELECT * FROM world_milestones ORDER BY ts DESC LIMIT ?')
      .all(limit) as WorldMilestone[];
  }
}
