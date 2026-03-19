import express from 'express';
import path from 'path';
import { getPool } from '../db/pgClient';
import { buildWorldUpdate } from '../world/WorldState';
import { WorldLog } from '../world/WorldLog';
import { enqueue } from '../world/DirectiveQueue';
import { ollama } from '../llm/OllamaClient';
import { usageTracker } from '../llm/UsageTracker';
import { Significance } from '../types';

const worldLog = new WorldLog();

export function createHttpServer(port: number): void {
  const app = express();
  app.use(express.json());

  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // ── World state ───────────────────────────────────────────────────────────
  app.get('/state', async (_req, res) => {
    const recentLog = await worldLog.getRecent(20);
    res.json(await buildWorldUpdate(recentLog));
  });

  // ── Souls ─────────────────────────────────────────────────────────────────
  app.get('/souls', async (_req, res) => {
    const { rows } = await getPool().query(
      'SELECT id, name, email, vitals, is_active, created_at FROM souls',
    );
    res.json(rows);
  });

  app.get('/souls/:id', async (req, res) => {
    const pool   = getPool();
    const soulId = req.params['id']!;

    const { rows: soulRows } = await pool.query(
      'SELECT * FROM souls WHERE id = $1',
      [soulId],
    );
    if (!soulRows.length) { res.status(404).json({ error: 'Soul not found' }); return; }

    const [soul, wallet, quirks, recentRewards, memory, sessions] = await Promise.all([
      soulRows[0],
      pool.query('SELECT * FROM wallets WHERE soul_id = $1', [soulId]).then(r => r.rows[0]),
      pool.query('SELECT * FROM quirks WHERE soul_id = $1', [soulId]).then(r => r.rows),
      pool.query('SELECT * FROM reward_history WHERE soul_id = $1 ORDER BY tick DESC LIMIT 20', [soulId]).then(r => r.rows),
      pool.query('SELECT * FROM soul_memory WHERE soul_id = $1 ORDER BY ts DESC LIMIT 10', [soulId]).then(r => r.rows),
      pool.query('SELECT * FROM browser_sessions WHERE soul_id = $1', [soulId]).then(r => r.rows),
    ]);

    res.json({ soul, wallet, quirks, recent_rewards: recentRewards, memory, sessions });
  });

  // ── Directives ────────────────────────────────────────────────────────────
  app.post('/directives', async (req, res) => {
    const { soul_id, message, visitor_id } = req.body as {
      soul_id?: string;
      message?: string;
      visitor_id?: string;
    };

    if (!soul_id || !message?.trim()) {
      res.status(400).json({ error: 'soul_id and message are required' });
      return;
    }

    const { rows } = await getPool().query('SELECT id FROM souls WHERE id = $1', [soul_id]);
    if (!rows.length) { res.status(404).json({ error: 'Soul not found' }); return; }

    const directive = await enqueue(soul_id, message.trim(), visitor_id ?? 'visitor');
    res.status(201).json(directive);
  });

  app.get('/directives', async (_req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM directives ORDER BY ts DESC LIMIT 50',
    );
    res.json(rows);
  });

  // ── World log + milestones ────────────────────────────────────────────────
  app.get('/log', async (req, res) => {
    const limit        = Math.min(Number(req.query['limit'] ?? 200), 200);
    const soul_id      = req.query['soul_id']      as string | undefined;
    const significance = req.query['significance'] as string | undefined;
    const since        = req.query['since'] ? Number(req.query['since']) : undefined;
    res.json(await worldLog.getFiltered({ limit, soul_id, since, significance }));
  });

  app.get('/milestones', async (_req, res) => {
    res.json(await worldLog.getMilestones(20));
  });

  // ── Soul memory ───────────────────────────────────────────────────────────
  app.get('/souls/:id/memory', async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM soul_memory WHERE soul_id = $1 ORDER BY ts DESC LIMIT 20',
      [req.params['id']],
    );
    res.json(rows);
  });

  // ── Soul goals ────────────────────────────────────────────────────────────
  app.get('/souls/:id/goals', async (req, res) => {
    const { rows } = await getPool().query(
      "SELECT * FROM soul_goals WHERE soul_id = $1 ORDER BY formed_at DESC",
      [req.params['id']],
    );
    res.json(rows);
  });

  // ── Ghost posts ───────────────────────────────────────────────────────────
  app.get('/souls/:id/posts', async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM ghost_posts WHERE soul_id = $1 ORDER BY ts DESC LIMIT 20',
      [req.params['id']],
    );
    res.json(rows);
  });

  // ── Social posts ──────────────────────────────────────────────────────────
  app.get('/souls/:id/social', async (req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM social_posts WHERE soul_id = $1 ORDER BY ts DESC LIMIT 20',
      [req.params['id']],
    );
    res.json(rows);
  });

  // ── Library archive ───────────────────────────────────────────────────────
  app.get('/archive', async (req, res) => {
    const limit   = Math.min(Number(req.query['limit'] ?? 50), 200);
    const type    = req.query['type']    as string | undefined;
    const soul_id = req.query['soul_id'] as string | undefined;

    let sql = `
      SELECT lw.id, lw.soul_id, lw.type, lw.title, lw.content, lw.metadata, lw.ts,
             s.name AS soul_name
      FROM library_works lw
      JOIN souls s ON s.id = lw.soul_id
    `;
    let paramCount = 0;
    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (type)    { conditions.push(`lw.type = $${++paramCount}`);    params.push(type); }
    if (soul_id) { conditions.push(`lw.soul_id = $${++paramCount}`); params.push(soul_id); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ` ORDER BY lw.ts DESC LIMIT $${++paramCount}`;
    params.push(limit);

    const { rows } = await getPool().query(sql, params);
    res.json(rows);
  });

  // ── World objects ─────────────────────────────────────────────────────────
  app.get('/world-objects', async (req, res) => {
    const floor = req.query['floor'] !== undefined ? Number(req.query['floor']) : undefined;
    let sql = 'SELECT * FROM world_objects';
    let paramCount = 0;
    const params: unknown[] = [];
    if (floor !== undefined) { sql += ` WHERE floor = $${++paramCount}`; params.push(floor); }
    sql += ` ORDER BY created_at DESC LIMIT $${++paramCount}`;
    params.push(200);
    const { rows } = await getPool().query(sql, params);
    res.json(rows);
  });

  // ── Action registry ───────────────────────────────────────────────────────
  app.get('/registry', async (_req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM action_registry ORDER BY created_at ASC',
    );
    res.json(rows);
  });

  // ── Ventures ──────────────────────────────────────────────────────────────
  app.get('/ventures', async (_req, res) => {
    const { rows } = await getPool().query(
      'SELECT * FROM joint_ventures ORDER BY created_at DESC LIMIT 50',
    );
    res.json(rows);
  });

  app.get('/ventures/:id', async (req, res) => {
    const pool = getPool();
    const { rows: ventureRows } = await pool.query(
      'SELECT * FROM joint_ventures WHERE id = $1',
      [req.params['id']],
    );
    if (!ventureRows.length) { res.status(404).json({ error: 'Venture not found' }); return; }
    const { rows: proposals } = await pool.query(
      'SELECT * FROM venture_proposals WHERE venture_id = $1 ORDER BY ts ASC',
      [req.params['id']],
    );
    res.json({ venture: ventureRows[0], proposals });
  });

  // ── LLM directive response ────────────────────────────────────────────────
  app.post('/llm/directive-response', async (req, res) => {
    const { soul_id, prompt } = req.body as { soul_id?: string; prompt?: string };

    if (!soul_id || !prompt?.trim()) {
      res.status(400).json({ error: 'soul_id and prompt are required' });
      return;
    }

    const { rows } = await getPool().query(
      'SELECT id, name FROM souls WHERE id = $1',
      [soul_id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Soul not found' }); return; }

    const soul = rows[0] as { id: string; name: string };

    const response = await ollama.chat([
      { role: 'system', content: 'You are a sim resident responding to a directive. Be concise and in-character.' },
      { role: 'user',   content: prompt.trim() },
    ], { temperature: 0.8 });

    const text = response ?? 'Understood.';

    // Log to world log so it persists and appears in the live feed
    await worldLog.append({
      soul_id:      soul.id,
      action:       'directive_response',
      description:  `${soul.name.split(' ')[0]}: ${text}`,
      significance: Significance.NOTABLE,
      metadata:     { directive_prompt: prompt.trim() },
      ts:           Math.floor(Date.now() / 1000),
    });

    res.json({ response: text });
  });

  // ── Stats (token usage, cost, world metrics) ──────────────────────────────
  app.get('/stats', async (_req, res) => {
    const windowSec = Number(_req.query['window'] ?? 3600);
    const windowMs  = Math.min(Math.max(windowSec, 60), 7 * 24 * 3600) * 1_000;

    const usage = usageTracker.getStats(windowMs);

    // World metrics from DB
    const pool = getPool();
    const [soulsRes, tickRes, actionsRes] = await Promise.all([
      pool.query<{ cnt: string }>('SELECT COUNT(*) as cnt FROM souls WHERE is_active = TRUE'),
      pool.query<{ tick: number }>('SELECT tick FROM souls WHERE is_active = TRUE ORDER BY tick DESC LIMIT 1'),
      pool.query<{ cnt: string }>(`SELECT COUNT(*) as cnt FROM world_log WHERE ts > $1`, [Date.now() - 3_600_000]),
    ]);

    res.json({
      uptime_s:     Math.round(process.uptime()),
      memory_mb:    Math.round(process.memoryUsage().rss / 1024 / 1024),
      model:        process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5',
      window_s:     windowSec,
      llm:          usage,
      world: {
        souls_active:       Number((soulsRes.rows[0] as Record<string,string>)?.['cnt'] ?? 0),
        tick:               Number((tickRes.rows[0] as Record<string,number>)?.['tick'] ?? 0),
        actions_last_hour:  Number((actionsRes.rows[0] as Record<string,string>)?.['cnt'] ?? 0),
      },
    });
  });

  // ── Admin: deactivate / reactivate ────────────────────────────────────────
  app.post('/souls/:id/deactivate', async (req, res) => {
    await getPool().query('UPDATE souls SET is_active = FALSE WHERE id = $1', [req.params['id']]);
    res.json({ ok: true });
  });

  app.post('/souls/:id/activate', async (req, res) => {
    await getPool().query('UPDATE souls SET is_active = TRUE WHERE id = $1', [req.params['id']]);
    res.json({ ok: true });
  });

  app.listen(port, () => {
    process.stdout.write(`[HTTP] Admin server on http://localhost:${port}\n`);
  });
}
