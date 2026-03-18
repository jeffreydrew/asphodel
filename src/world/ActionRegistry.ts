import { randomUUID } from 'crypto';
import { getPool } from '../db/pgClient';
import { ActionType, Significance } from '../types';
import type { RegistryAction, SoulVitals } from '../types';

// ─── In-memory cache ──────────────────────────────────────────────────────────

let cache: RegistryAction[] = [];
let cacheTs = 0;
const CACHE_TTL = 60_000; // 1 minute

function rowToRegistryAction(row: Record<string, unknown>): RegistryAction {
  return {
    id:               row['id'] as string,
    label:            row['label'] as string,
    description:      row['description'] as string,
    // vitals_effect and prerequisites are JSONB — already parsed by pg
    vitals_effect:    (row['vitals_effect'] as Partial<SoulVitals>) ?? {},
    profit_delta:     row['profit_delta'] as number,
    social_delta:     row['social_delta'] as number,
    prerequisites:    (row['prerequisites'] as string[] | null) ?? null,
    created_by:       row['created_by'] as string,
    // is_collaborative is BOOLEAN — already a JS boolean
    is_collaborative: row['is_collaborative'] as boolean,
    min_participants: row['min_participants'] as number,
    max_participants: row['max_participants'] as number,
    created_at:       row['created_at'] as number,
  };
}

export async function getRegistryActions(): Promise<RegistryAction[]> {
  const now = Date.now();
  if (now - cacheTs <= CACHE_TTL) return cache;

  const { rows } = await getPool().query(
    'SELECT * FROM action_registry ORDER BY created_at ASC',
  );
  cache   = rows.map(rowToRegistryAction);
  cacheTs = now;
  return cache;
}

export function invalidateCache(): void {
  cacheTs = 0;
}

// ─── Sanity bounds ────────────────────────────────────────────────────────────

const VITAL_KEYS: (keyof SoulVitals)[] = ['hunger', 'energy', 'health', 'happiness', 'sleep_debt'];
const MAX_DELTA = 40;

function sanitizeVitalsEffect(effect: Partial<SoulVitals>): Partial<SoulVitals> {
  const sanitized: Partial<SoulVitals> = {};
  for (const key of VITAL_KEYS) {
    if (effect[key] !== undefined) {
      sanitized[key] = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, effect[key]!));
    }
  }
  return sanitized;
}

// ─── Auto-register novel labels ───────────────────────────────────────────────

export async function autoRegister(
  label: string,
  description: string,
  soulId: string,
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO action_registry
         (id, label, description, vitals_effect, profit_delta, social_delta,
          prerequisites, created_by, is_collaborative, min_participants, max_participants, created_at)
       VALUES ($1, $2, $3, '{}', 0, 0, null, $4, FALSE, 1, 1, $5)
       ON CONFLICT (label) DO NOTHING`,
      [randomUUID(), label, description.substring(0, 200), soulId, Date.now()],
    );
    invalidateCache();

    await getPool().query(
      `INSERT INTO world_log (soul_id, significance, action, description, metadata, ts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        soulId,
        Significance.NOTABLE,
        'new_action',
        `A new action emerged: "${label}" — ${description.substring(0, 100)}`,
        { label, created_by: soulId },
        Date.now(),
      ],
    );

    process.stdout.write(`[ActionRegistry] Auto-registered novel action: "${label}" by ${soulId}\n`);
  } catch { /* ignore — never throw */ }
}

// ─── Proposal (visitor-proposed actions) ─────────────────────────────────────

const BUILTIN_LABELS = new Set(Object.values(ActionType) as string[]);
const LABEL_RE = /^[a-z][a-z0-9_]{1,31}$/;

export async function proposeAction(
  proposal: { label: string; description: string; vitals_effect: Partial<SoulVitals> },
  soulId: string,
): Promise<RegistryAction | null> {
  const label = proposal.label.trim().toLowerCase().replace(/\s+/g, '_');

  if (BUILTIN_LABELS.has(label)) return null;
  if (!LABEL_RE.test(label)) return null;

  const { rows: existing } = await getPool().query(
    'SELECT id FROM action_registry WHERE label = $1',
    [label],
  );
  if (existing.length > 0) return null;

  const vitals_effect = sanitizeVitalsEffect(proposal.vitals_effect ?? {});

  const action: RegistryAction = {
    id:               randomUUID(),
    label,
    description:      String(proposal.description ?? '').substring(0, 200),
    vitals_effect,
    profit_delta:     0,
    social_delta:     5,
    prerequisites:    null,
    created_by:       soulId,
    is_collaborative: false,
    min_participants: 1,
    max_participants: 1,
    created_at:       Date.now(),
  };

  await getPool().query(
    `INSERT INTO action_registry
       (id, label, description, vitals_effect, profit_delta, social_delta,
        prerequisites, created_by, is_collaborative, min_participants, max_participants, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, null, $7, FALSE, 1, 1, $8)`,
    [
      action.id, action.label, action.description,
      action.vitals_effect, action.profit_delta, action.social_delta,
      action.created_by, action.created_at,
    ],
  );

  invalidateCache();
  process.stdout.write(`[ActionRegistry] New action proposed: "${label}" by ${soulId}\n`);
  return action;
}

// ─── Seed built-in registry actions ──────────────────────────────────────────

interface SeedEntry {
  label: string;
  description: string;
  vitals_effect: Partial<SoulVitals>;
  profit_delta?: number;
  social_delta?: number;
  is_collaborative?: boolean;
}

export async function seedRegistry(systemSoulId: string): Promise<void> {
  const seeds: SeedEntry[] = [
    // ── Biological needs ────────────────────────────────────────────────────
    { label: 'rest',     description: 'Sleep or rest to recover energy and reduce sleep debt',   vitals_effect: { energy: 30, sleep_debt: -20 },              profit_delta: 0, social_delta: 0 },
    { label: 'nap',      description: 'Take a short nap to partially recover energy',             vitals_effect: { energy: 15, sleep_debt: -10 },              profit_delta: 0, social_delta: 0 },
    { label: 'eat',      description: 'Have a meal to reduce hunger and restore energy',          vitals_effect: { hunger: -40, energy: 5 },                   profit_delta: 0, social_delta: 0 },
    { label: 'cook',     description: 'Cook a meal from scratch in the tower kitchen',            vitals_effect: { hunger: -25, happiness: 6, energy: -5 },    profit_delta: 0, social_delta: 2 },
    { label: 'exercise', description: 'Work out to improve health and fitness',                   vitals_effect: { health: 10, energy: -15, hunger: 10 },      profit_delta: 0, social_delta: 2 },
    { label: 'walk',     description: 'Take a walk to clear the mind and maintain health',        vitals_effect: { health: 5, energy: -5, happiness: 3 },      profit_delta: 0, social_delta: 1 },

    // ── Idle / introspective ─────────────────────────────────────────────────
    { label: 'idle',     description: 'Do nothing in particular for a while',                    vitals_effect: { energy: -1 },                               profit_delta: 0, social_delta: 0 },
    { label: 'meditate', description: 'Meditate to restore peace and mental clarity',            vitals_effect: { energy: 5, happiness: 8, health: 3 },       profit_delta: 0, social_delta: 0 },
    { label: 'journal',  description: 'Write privately in a personal journal',                   vitals_effect: { happiness: 6, energy: -4 },                 profit_delta: 0, social_delta: 0 },

    // ── Work / income ────────────────────────────────────────────────────────
    { label: 'browse_jobs',        description: 'Search job boards and task platforms for gig work',    vitals_effect: { energy: -3 },                         profit_delta: 2, social_delta: 0 },
    { label: 'submit_application', description: 'Apply to a gig or task found on job boards',          vitals_effect: { energy: -8, happiness: 5 },            profit_delta: 8, social_delta: 1 },
    { label: 'work',               description: 'Put in focused work on current projects or tasks',    vitals_effect: { energy: -15, hunger: 8 },              profit_delta: 6, social_delta: 0 },

    // ── Creative / library ───────────────────────────────────────────────────
    { label: 'create_content', description: 'Write something — a blog post, article, or social thread', vitals_effect: { energy: -10, happiness: 8 },         profit_delta: 5, social_delta: 3 },
    { label: 'write_book',     description: 'Write a longer creative or intellectual work in the library', vitals_effect: { energy: -12, happiness: 10 },     profit_delta: 3, social_delta: 2 },
    { label: 'create_art',     description: 'Make art in the library — visual, textual, or abstract',   vitals_effect: { energy: -10, happiness: 12 },        profit_delta: 2, social_delta: 3 },
    { label: 'read_book',      description: 'Read a book in the library to expand your mind',           vitals_effect: { energy: -5, happiness: 5, health: 2 }, profit_delta: 0, social_delta: 0 },
    { label: 'browse_web',     description: 'Research a topic online in the library',                   vitals_effect: { energy: -2 },                        profit_delta: 0, social_delta: 1 },

    // ── Social ───────────────────────────────────────────────────────────────
    { label: 'social_post', description: 'Post something on Twitter or Reddit as yourself',            vitals_effect: { happiness: 5 },                        profit_delta: 1, social_delta: 6 },
    { label: 'meet_soul',   description: 'Spend time talking with another soul in the tower',          vitals_effect: { happiness: 10, energy: -5 },           profit_delta: 0, social_delta: 8, is_collaborative: true },
    { label: 'socialize',   description: 'Socialize informally with neighbours in the common areas',   vitals_effect: { happiness: 12, energy: -8 },           profit_delta: 0, social_delta: 10, is_collaborative: true },

    // ── World objects ────────────────────────────────────────────────────────
    { label: 'place_object',  description: 'Place a personal object somewhere in the tower',        vitals_effect: { happiness: 5, energy: -3 },              profit_delta: 0, social_delta: 2 },
    { label: 'modify_object', description: 'Rearrange or change an object you own in the tower',    vitals_effect: { happiness: 3, energy: -2 },              profit_delta: 0, social_delta: 1 },
    { label: 'gift_object',   description: 'Give one of your objects to another soul as a gesture', vitals_effect: { happiness: 8, energy: -2 },              profit_delta: 0, social_delta: 5 },
  ];

  const pool = getPool();
  for (const seed of seeds) {
    await pool.query(
      `INSERT INTO action_registry
         (id, label, description, vitals_effect, profit_delta, social_delta,
          prerequisites, created_by, is_collaborative, min_participants, max_participants, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, null, $7, $8, 1, 1, $9)
       ON CONFLICT (label) DO NOTHING`,
      [
        randomUUID(),
        seed.label,
        seed.description,
        seed.vitals_effect,
        seed.profit_delta ?? 0,
        seed.social_delta ?? 0,
        systemSoulId,
        seed.is_collaborative ?? false,
        Date.now(),
      ],
    );
  }

  invalidateCache();
}
