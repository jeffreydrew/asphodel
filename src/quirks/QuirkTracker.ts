import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import { ActionType, Significance } from '../types';
import type { QuirkRecord } from '../types';

// Maps action types to the quirk they reinforce
const ACTION_QUIRK_MAP: Partial<Record<ActionType, { quirkId: string; trigger: string }>> = {
  [ActionType.CREATE_CONTENT]: {
    quirkId: 'prolific_writer',
    trigger: 'defaults to writing tasks when uncertain about next action',
  },
  [ActionType.BROWSE_JOBS]: {
    quirkId: 'marketplace_hustler',
    trigger: 'checks job boards every 3 ticks regardless of goals',
  },
  [ActionType.MEET_SOUL]: {
    quirkId: 'compulsive_helper',
    trigger: 'responds to any soul in distress within 2 ticks',
  },
  [ActionType.REST]: {
    quirkId: 'night_owl',
    trigger: 'productivity peaks after sim-hour 20; rests heavily during the day',
  },
  [ActionType.EXERCISE]: {
    quirkId: 'fitness_devotee',
    trigger: 'exercises even when energy is low',
  },
  [ActionType.IDLE]: {
    quirkId: 'recluse',
    trigger: 'avoids meeting actions when happiness < 40',
  },
};

const SEED_THRESHOLD    = 5;
const PERSIST_THRESHOLD = 15;

// strength approaches 1.0 asymptotically: 1 − e^(−count/20)
function computeStrength(count: number): number {
  return Math.round((1 - Math.exp(-count / 20)) * 10_000) / 10_000;
}

export class QuirkTracker {
  reinforce(soulId: string, action: ActionType, rewardTotal: number): Record<string, number> {
    const quirkDef = ACTION_QUIRK_MAP[action];
    if (!quirkDef || rewardTotal <= 0) return {};

    const db = getDb();
    const now = Date.now();

    const existing = db
      .prepare('SELECT * FROM quirks WHERE soul_id = ? AND quirk_id = ?')
      .get(soulId, quirkDef.quirkId) as QuirkRecord | undefined;

    const count = (existing?.reinforcement_count ?? 0) + 1;
    const strength = computeStrength(count);
    const seeded    = count >= SEED_THRESHOLD;
    const persisted = count >= PERSIST_THRESHOLD;

    const wasSeeded    = existing?.seeded    ?? false;
    const wasPersisted = existing?.persisted ?? false;

    if (!existing) {
      db.prepare(`
        INSERT INTO quirks (id, soul_id, quirk_id, trigger, strength, reinforcement_count, seeded, persisted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), soulId, quirkDef.quirkId, quirkDef.trigger,
        strength, count,
        seeded ? 1 : 0,
        persisted ? 1 : 0,
        now,
      );
    } else {
      db.prepare(`
        UPDATE quirks
        SET strength = ?, reinforcement_count = ?, seeded = ?, persisted = ?
        WHERE soul_id = ? AND quirk_id = ?
      `).run(
        strength, count,
        seeded ? 1 : 0,
        persisted ? 1 : 0,
        soulId, quirkDef.quirkId,
      );
    }

    // Log threshold-crossing events
    if (!wasSeeded && seeded) {
      db.prepare(`
        INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        soulId,
        Significance.NOTABLE,
        'quirk_seeded',
        `A new tendency is emerging: "${quirkDef.quirkId}"`,
        JSON.stringify({ quirk_id: quirkDef.quirkId, strength }),
        now,
      );
    }

    if (!wasPersisted && persisted) {
      const description = `Quirk "${quirkDef.quirkId}" is now part of who they are [strength: ${strength}]`;

      db.prepare(`
        INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        soulId,
        Significance.SIGNIFICANT,
        'quirk_persisted',
        description,
        JSON.stringify({ quirk_id: quirkDef.quirkId, strength }),
        now,
      );

      db.prepare(`
        INSERT INTO world_milestones (soul_id, title, description, ts)
        VALUES (?, ?, ?, ?)
      `).run(
        soulId,
        `New Persistent Quirk: ${quirkDef.quirkId}`,
        description,
        now,
      );
    }

    return { [quirkDef.quirkId]: strength };
  }

  getQuirks(soulId: string): QuirkRecord[] {
    const rows = getDb()
      .prepare('SELECT * FROM quirks WHERE soul_id = ?')
      .all(soulId) as Array<Omit<QuirkRecord, 'seeded' | 'persisted'> & { seeded: number; persisted: number }>;

    return rows.map(r => ({
      ...r,
      seeded:    r.seeded    === 1,
      persisted: r.persisted === 1,
    }));
  }

  getPersistedQuirks(soulId: string): QuirkRecord[] {
    return this.getQuirks(soulId).filter(q => q.persisted);
  }
}
