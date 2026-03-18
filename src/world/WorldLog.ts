import { getPool } from '../db/pgClient';
import { Significance } from '../types';
import type { WorldLogEntry, WorldMilestone } from '../types';

export class WorldLog {
  async append(entry: Omit<WorldLogEntry, 'id'>): Promise<void> {
    await getPool().query(
      `INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.soul_id,
        entry.significance,
        entry.action,
        entry.description,
        entry.metadata ?? null,
        entry.ts,
      ],
    );

    if (entry.significance === Significance.SIGNIFICANT) {
      await this.appendMilestone({
        soul_id:     entry.soul_id,
        title:       entry.description.substring(0, 80),
        description: entry.description,
        ts:          entry.ts,
      });
    }
  }

  async appendMilestone(milestone: Omit<WorldMilestone, 'id'>): Promise<void> {
    await getPool().query(
      `INSERT INTO world_milestones (soul_id, title, description, ts)
       VALUES ($1, $2, $3, $4)`,
      [milestone.soul_id, milestone.title, milestone.description, milestone.ts],
    );
  }

  async getRecent(limit = 20): Promise<WorldLogEntry[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM world_log ORDER BY ts DESC LIMIT $1',
      [limit],
    );
    // metadata is JSONB — already parsed by pg
    return rows as WorldLogEntry[];
  }

  async getFiltered(params: {
    limit?: number;
    soul_id?: string;
    since?: number;
    significance?: string;
  }): Promise<Array<WorldLogEntry & { soul_name: string }>> {
    const { limit = 200, soul_id, since, significance } = params;

    let paramCount = 0;
    const conditions: string[] = [];
    const args: unknown[] = [];

    if (soul_id)      { conditions.push(`wl.soul_id = $${++paramCount}`);      args.push(soul_id); }
    if (since)        { conditions.push(`wl.ts >= $${++paramCount}`);           args.push(since); }
    if (significance) { conditions.push(`wl.significance = $${++paramCount}`);  args.push(significance); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limitParam = `$${++paramCount}`;
    args.push(limit);

    const { rows } = await getPool().query(
      `SELECT wl.*, s.name AS soul_name
       FROM world_log wl
       LEFT JOIN souls s ON s.id = wl.soul_id
       ${where}
       ORDER BY wl.ts DESC LIMIT ${limitParam}`,
      args,
    );

    return rows as Array<WorldLogEntry & { soul_name: string }>;
  }

  async getMilestones(limit = 10): Promise<WorldMilestone[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM world_milestones ORDER BY ts DESC LIMIT $1',
      [limit],
    );
    return rows as WorldMilestone[];
  }
}
