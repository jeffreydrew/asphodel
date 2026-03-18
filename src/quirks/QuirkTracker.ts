import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/pgClient';
import { Significance } from '../types';
import type { QuirkRecord } from '../types';

const ACTION_QUIRK_MAP: Record<string, { quirkId: string; trigger: string }> = {
  'create_content': {
    quirkId: 'prolific_writer',
    trigger: 'defaults to writing tasks when uncertain about next action',
  },
  'browse_jobs': {
    quirkId: 'marketplace_hustler',
    trigger: 'checks job boards every 3 ticks regardless of goals',
  },
  'meet_soul': {
    quirkId: 'compulsive_helper',
    trigger: 'responds to any soul in distress within 2 ticks',
  },
  'rest': {
    quirkId: 'night_owl',
    trigger: 'productivity peaks after sim-hour 20; rests heavily during the day',
  },
  'exercise': {
    quirkId: 'fitness_devotee',
    trigger: 'exercises even when energy is low',
  },
  'idle': {
    quirkId: 'recluse',
    trigger: 'avoids meeting actions when happiness < 40',
  },
};

const SEED_THRESHOLD    = 5;
const PERSIST_THRESHOLD = 15;

function computeStrength(count: number): number {
  return Math.round((1 - Math.exp(-count / 20)) * 10_000) / 10_000;
}

export class QuirkTracker {
  async reinforce(
    soulId: string,
    action: string,
    rewardTotal: number,
  ): Promise<Record<string, number>> {
    if (rewardTotal <= 0) return {};

    let quirkDef = ACTION_QUIRK_MAP[action];
    if (!quirkDef) {
      const l = action.toLowerCase();
      if (/write|creat|art|publish|book/.test(l)) quirkDef = ACTION_QUIRK_MAP['create_content'];
      else if (/job|work|apply|earn/.test(l))     quirkDef = ACTION_QUIRK_MAP['browse_jobs'];
      else if (/meet|social|chat|talk/.test(l))   quirkDef = ACTION_QUIRK_MAP['meet_soul'];
      else if (/rest|sleep|nap/.test(l))          quirkDef = ACTION_QUIRK_MAP['rest'];
      else if (/exercise|gym|yoga/.test(l))       quirkDef = ACTION_QUIRK_MAP['exercise'];
      else if (/idle|nothing/.test(l))            quirkDef = ACTION_QUIRK_MAP['idle'];
    }
    if (!quirkDef) return {};

    const pool = getPool();
    const now  = Date.now();

    const { rows } = await pool.query(
      'SELECT * FROM quirks WHERE soul_id = $1 AND quirk_id = $2',
      [soulId, quirkDef.quirkId],
    );
    const existing = rows[0] as QuirkRecord | undefined;

    const count     = (existing?.reinforcement_count ?? 0) + 1;
    const strength  = computeStrength(count);
    const seeded    = count >= SEED_THRESHOLD;
    const persisted = count >= PERSIST_THRESHOLD;

    // pg returns BOOLEAN as JS boolean — no === 1 needed
    const wasSeeded    = existing?.seeded    ?? false;
    const wasPersisted = existing?.persisted ?? false;

    if (!existing) {
      await pool.query(
        `INSERT INTO quirks
           (id, soul_id, quirk_id, trigger, strength, reinforcement_count, seeded, persisted, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [uuidv4(), soulId, quirkDef.quirkId, quirkDef.trigger, strength, count, seeded, persisted, now],
      );
    } else {
      await pool.query(
        `UPDATE quirks
         SET strength = $1, reinforcement_count = $2, seeded = $3, persisted = $4
         WHERE soul_id = $5 AND quirk_id = $6`,
        [strength, count, seeded, persisted, soulId, quirkDef.quirkId],
      );
    }

    if (!wasSeeded && seeded) {
      await pool.query(
        `INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          soulId,
          Significance.NOTABLE,
          'quirk_seeded',
          `A new tendency is emerging: "${quirkDef.quirkId}"`,
          { quirk_id: quirkDef.quirkId, strength },
          now,
        ],
      );
    }

    if (!wasPersisted && persisted) {
      const description = `Quirk "${quirkDef.quirkId}" is now part of who they are [strength: ${strength}]`;

      await pool.query(
        `INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          soulId,
          Significance.SIGNIFICANT,
          'quirk_persisted',
          description,
          { quirk_id: quirkDef.quirkId, strength },
          now,
        ],
      );

      await pool.query(
        `INSERT INTO world_milestones (soul_id, title, description, ts)
         VALUES ($1, $2, $3, $4)`,
        [soulId, `New Persistent Quirk: ${quirkDef.quirkId}`, description, now],
      );
    }

    return { [quirkDef.quirkId]: strength };
  }

  async getQuirks(soulId: string): Promise<QuirkRecord[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM quirks WHERE soul_id = $1',
      [soulId],
    );
    return rows as QuirkRecord[];
  }

  async getPersistedQuirks(soulId: string): Promise<QuirkRecord[]> {
    const quirks = await this.getQuirks(soulId);
    return quirks.filter(q => q.persisted);
  }
}
