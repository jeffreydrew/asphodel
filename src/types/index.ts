// ─── Action Types ────────────────────────────────────────────────────────────

export enum ActionType {
  BROWSE_JOBS     = 'browse_jobs',
  SUBMIT_APP      = 'submit_application',
  SOCIAL_POST     = 'social_post',
  MEET_SOUL       = 'meet_soul',
  REST            = 'rest',
  EAT             = 'eat',
  EXERCISE        = 'exercise',
  CREATE_CONTENT  = 'create_content',
  IDLE            = 'idle',
  // Library actions
  READ_BOOK       = 'read_book',
  WRITE_BOOK      = 'write_book',
  CREATE_ART      = 'create_art',
  BROWSE_WEB      = 'browse_web',
}

// Base cooldowns in ms. Multiply by COOLDOWN_SCALE env var to speed up / slow down.
const SCALE = Number(process.env['COOLDOWN_SCALE'] ?? 1);

export const COOLDOWNS: Record<ActionType, number> = {
  [ActionType.BROWSE_JOBS]:    20_000  * SCALE,
  [ActionType.SUBMIT_APP]:     60_000  * SCALE,
  [ActionType.SOCIAL_POST]:    45_000  * SCALE,
  [ActionType.MEET_SOUL]:      25_000  * SCALE,
  [ActionType.REST]:           15_000  * SCALE,
  [ActionType.EAT]:            15_000  * SCALE,
  [ActionType.EXERCISE]:       15_000  * SCALE,
  [ActionType.CREATE_CONTENT]: 90_000  * SCALE,
  [ActionType.IDLE]:            8_000  * SCALE,
  // Library cooldowns
  [ActionType.READ_BOOK]:      30_000  * SCALE,
  [ActionType.WRITE_BOOK]:     90_000  * SCALE,
  [ActionType.CREATE_ART]:     75_000  * SCALE,
  [ActionType.BROWSE_WEB]:     35_000  * SCALE,
};

// ─── Soul ────────────────────────────────────────────────────────────────────

export interface SoulVitals {
  hunger: number;     // 0–100; higher = more hungry
  energy: number;     // 0–100; higher = more energized
  health: number;     // 0–100
  happiness: number;  // 0–100
  sleep_debt: number; // 0–100; higher = more deprived
}

export interface RewardWeights {
  w1_profit: number;  // default 0.40
  w2_social: number;  // default 0.35
  w3_health: number;  // default 0.25
}

export interface SoulIdentity {
  full_name: string;
  email: string;
  username_pool: Record<string, string>;
  bio: string;
  skills_public: string[];
  portfolio_url: string;
  location_public: string;
  profile_photo: string;
  payment_method: string;
}

export interface SoulRecord {
  id: string;
  name: string;
  email: string;
  identity: SoulIdentity;
  vitals: SoulVitals;
  reward_weights: RewardWeights;
  is_active: boolean;
  created_at: number; // Unix ms
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export interface WalletRow {
  id: string;
  soul_id: string;
  balance_abstract: number;
  balance_real: number;
  currency: string;
  lifetime_earned: number;
  lifetime_spent: number;
}

export type TransactionType = 'earned' | 'spent';

export interface TransactionRow {
  id: string;
  soul_id: string;
  type: TransactionType;
  source: string;
  amount: number;
  ts: number; // Unix ms
}

// ─── Reward ──────────────────────────────────────────────────────────────────

export interface RewardComponents {
  r_profit: number;
  r_social: number;
  r_health: number;
  r_penalty: number;
  r_total: number;
}

export interface RewardHistoryRow {
  id?: number;
  soul_id: string;
  tick: number;
  r_profit: number;
  r_social: number;
  r_health: number;
  r_penalty: number;
  r_total: number;
  action_that_caused: ActionType;
  quirk_delta: Record<string, number> | null;
  ts: number; // Unix ms
}

// ─── Quirks ──────────────────────────────────────────────────────────────────

export interface QuirkRecord {
  id: string;
  soul_id: string;
  quirk_id: string;
  trigger: string;
  strength: number;           // 0.0 → 1.0 (asymptotic)
  reinforcement_count: number;
  seeded: boolean;            // true after 5 reinforcements
  persisted: boolean;         // true after 15 reinforcements
  created_at: number;         // Unix ms
}

// ─── Browser Sessions ─────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'suspended' | 'banned';

export interface BrowserSessionRow {
  id: string;
  soul_id: string;
  platform: string;
  session_cookie: string | null;
  last_active: number | null; // Unix ms
  tasks_completed: number;
  abstract_earned_here: number;
  status: SessionStatus;
}

// ─── World Log ────────────────────────────────────────────────────────────────

export enum Significance {
  ROUTINE     = 'ROUTINE',
  NOTABLE     = 'NOTABLE',
  SIGNIFICANT = 'SIGNIFICANT',
}

export interface WorldLogEntry {
  id?: number;
  soul_id: string | null;
  significance: Significance;
  action: ActionType | string;
  description: string;
  metadata: Record<string, unknown> | null;
  ts: number; // Unix ms
}

export interface WorldMilestone {
  id?: number;
  soul_id: string | null;
  title: string;
  description: string;
  ts: number; // Unix ms
}

// ─── Action ───────────────────────────────────────────────────────────────────

export interface Action {
  type: ActionType;
  payload: Record<string, unknown>;
  reasoning?: string;
}

export interface ActionResult {
  action: ActionType;
  success: boolean;
  description: string;
  profit_delta: number;
  social_delta: number;
  health_delta: number;
  penalty: number;
  vitals_after: SoulVitals;
  tos_violation: boolean;
  deceptive_content: boolean;
  metadata: Record<string, unknown>;
}

// ─── Browser / Session ───────────────────────────────────────────────────────

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  pay: string | null;
  description: string;
  url: string;
  platform: 'indeed' | 'craigslist' | 'mturk';
}

// ─── Directives ───────────────────────────────────────────────────────────────

export interface Directive {
  id: string;
  soul_id: string;
  visitor_id: string;
  message: string;
  injected: boolean;
  ts: number;
}

export interface DirectiveTask {
  directive: string;            // original visitor message
  description: string;          // LLM-interpreted task description
  relevant_actions: ActionType[]; // actions that fulfill this task
  steps_completed: number;
  max_steps: number;
  created_at: number;           // Unix ms
}

// ─── Soul Positions ───────────────────────────────────────────────────────────

export interface SoulPosition {
  soul_id: string;
  x: number;
  y: number;
  z: number;
}

// ─── WebSocket Broadcast ──────────────────────────────────────────────────────

export interface SoulSnapshot {
  id: string;
  name: string;
  vitals: SoulVitals;
  wallet: WalletRow;
  quirks: QuirkRecord[];
  last_action: ActionType | null;
  last_reward: RewardComponents | null;
  is_active: boolean;
  active_task: DirectiveTask | null;
}

export interface WorldUpdate {
  type: 'WORLD_UPDATE';
  ts: number;
  souls: SoulSnapshot[];
  recent_log: WorldLogEntry[];
  positions: SoulPosition[];
  tick: number;
}
