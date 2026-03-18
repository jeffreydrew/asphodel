import express from 'express';
import path from 'path';
import { getDb } from '../db/client';
import { buildWorldUpdate } from '../world/WorldState';
import { WorldLog } from '../world/WorldLog';
import { enqueue } from '../world/DirectiveQueue';

const worldLog = new WorldLog();

export function createHttpServer(port: number): void {
  const app = express();
  app.use(express.json());

  // ── Static Three.js frontend ─────────────────────────────────────────────
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // ── World state ───────────────────────────────────────────────────────────
  app.get('/state', (_req, res) => {
    res.json(buildWorldUpdate(worldLog.getRecent(20)));
  });

  // ── Souls ─────────────────────────────────────────────────────────────────
  app.get('/souls', (_req, res) => {
    const rows = getDb().prepare('SELECT id, name, email, vitals, is_active, created_at FROM souls').all();
    res.json(rows);
  });

  app.get('/souls/:id', (req, res) => {
    const soul = getDb().prepare('SELECT * FROM souls WHERE id = ?').get(req.params['id']);
    if (!soul) { res.status(404).json({ error: 'Soul not found' }); return; }

    const wallet       = getDb().prepare('SELECT * FROM wallets WHERE soul_id = ?').get(req.params['id']);
    const quirks       = getDb().prepare('SELECT * FROM quirks WHERE soul_id = ?').all(req.params['id']);
    const recentRewards = getDb().prepare('SELECT * FROM reward_history WHERE soul_id = ? ORDER BY tick DESC LIMIT 20').all(req.params['id']);
    const memory       = getDb().prepare('SELECT * FROM soul_memory WHERE soul_id = ? ORDER BY ts DESC LIMIT 10').all(req.params['id']);
    const sessions     = getDb().prepare('SELECT * FROM browser_sessions WHERE soul_id = ?').all(req.params['id']);

    res.json({ soul, wallet, quirks, recent_rewards: recentRewards, memory, sessions });
  });

  // ── Directives (visitor chat → soul) ─────────────────────────────────────
  app.post('/directives', (req, res) => {
    const { soul_id, message, visitor_id } = req.body as {
      soul_id?: string;
      message?: string;
      visitor_id?: string;
    };

    if (!soul_id || !message?.trim()) {
      res.status(400).json({ error: 'soul_id and message are required' });
      return;
    }

    const soul = getDb().prepare('SELECT id FROM souls WHERE id = ?').get(soul_id);
    if (!soul) { res.status(404).json({ error: 'Soul not found' }); return; }

    const directive = enqueue(soul_id, message.trim(), visitor_id ?? 'visitor');
    res.status(201).json(directive);
  });

  app.get('/directives', (_req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM directives ORDER BY ts DESC LIMIT 50')
      .all();
    res.json(rows);
  });

  // ── World log + milestones ────────────────────────────────────────────────
  app.get('/log', (req, res) => {
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    res.json(worldLog.getRecent(limit));
  });

  app.get('/milestones', (_req, res) => {
    res.json(worldLog.getMilestones(20));
  });

  // ── Soul memory ───────────────────────────────────────────────────────────
  app.get('/souls/:id/memory', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM soul_memory WHERE soul_id = ? ORDER BY ts DESC LIMIT 20')
      .all(req.params['id']);
    res.json(rows);
  });

  // ── Ghost posts ───────────────────────────────────────────────────────────
  app.get('/souls/:id/posts', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM ghost_posts WHERE soul_id = ? ORDER BY ts DESC LIMIT 20')
      .all(req.params['id']);
    res.json(rows);
  });

  // ── Social posts ──────────────────────────────────────────────────────────
  app.get('/souls/:id/social', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM social_posts WHERE soul_id = ? ORDER BY ts DESC LIMIT 20')
      .all(req.params['id']);
    res.json(rows);
  });

  // ── Library archive ──────────────────────────────────────────────────────
  app.get('/archive', (req, res) => {
    const limit   = Math.min(Number(req.query['limit'] ?? 50), 200);
    const type    = req.query['type']    as string | undefined;
    const soul_id = req.query['soul_id'] as string | undefined;

    let sql = `
      SELECT lw.id, lw.soul_id, lw.type, lw.title, lw.content, lw.metadata, lw.ts,
             s.name AS soul_name
      FROM library_works lw
      JOIN souls s ON s.id = lw.soul_id
    `;
    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (type)    { conditions.push('lw.type = ?');    params.push(type); }
    if (soul_id) { conditions.push('lw.soul_id = ?'); params.push(soul_id); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY lw.ts DESC LIMIT ?';
    params.push(limit);

    const rows = getDb().prepare(sql).all(...params);
    res.json(rows);
  });

  // ── Admin: deactivate / reactivate ───────────────────────────────────────
  app.post('/souls/:id/deactivate', (req, res) => {
    getDb().prepare('UPDATE souls SET is_active = 0 WHERE id = ?').run(req.params['id']);
    res.json({ ok: true });
  });

  app.post('/souls/:id/activate', (req, res) => {
    getDb().prepare('UPDATE souls SET is_active = 1 WHERE id = ?').run(req.params['id']);
    res.json({ ok: true });
  });

  app.listen(port, () => {
    process.stdout.write(`[HTTP] Admin server on http://localhost:${port}\n`);
  });
}
