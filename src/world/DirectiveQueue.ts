import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import type { Directive } from '../types';

// In-memory queue for fast reads (DB is the persistent store)
const queue = new Map<string, Directive[]>();

export function enqueue(soulId: string, message: string, visitorId = 'visitor'): Directive {
  const directive: Directive = {
    id:         uuidv4(),
    soul_id:    soulId,
    visitor_id: visitorId,
    message,
    injected:   false,
    ts:         Date.now(),
  };

  getDb().prepare(`
    INSERT INTO directives (id, soul_id, visitor_id, message, injected, ts)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(directive.id, soulId, visitorId, message, directive.ts);

  const existing = queue.get(soulId) ?? [];
  queue.set(soulId, [...existing, directive]);

  return directive;
}

// Atomically drain all pending directives for a soul (read + clear).
export function drain(soulId: string): Directive[] {
  const pending = queue.get(soulId) ?? [];
  queue.set(soulId, []);

  if (pending.length > 0) {
    const ids = pending.map(d => `'${d.id}'`).join(',');
    getDb().prepare(`UPDATE directives SET injected = 1 WHERE id IN (${ids})`).run();
  }

  return pending;
}

export function getRecent(limit = 5): Directive[] {
  return getDb()
    .prepare('SELECT * FROM directives ORDER BY ts DESC LIMIT ?')
    .all(limit) as Directive[];
}
