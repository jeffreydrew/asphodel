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
  // Autonomous tool actions
  SEARCH_WEB      = 'search_web',
  READ_CODEBASE   = 'read_codebase',
  WRITE_CODE      = 'write_code',
  CONSULT_AI      = 'consult_ai',
  RUN_COMMAND     = 'run_command',
}

// Base cooldowns in ms. Multiply by COOLDOWN_SCALE env var to speed up / slow down.
const SCALE = Number(process.env['COOLDOWN_SCALE'] ?? 1);

// Story-hours: 1 story-hour = 1 real minute in dev (COOLDOWN_SCALE * 60_000 ms)
export const STORY_HOUR_MS = 60_000 * Number(process.env['COOLDOWN_SCALE'] ?? 1);

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
  // Tool cooldowns
  [ActionType.SEARCH_WEB]:     40_000  * SCALE,
  [ActionType.READ_CODEBASE]:  30_000  * SCALE,
  [ActionType.WRITE_CODE]:    120_000  * SCALE,
  [ActionType.CONSULT_AI]:     60_000  * SCALE,
  [ActionType.RUN_COMMAND]:    45_000  * SCALE,
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
  llm_model?: string;   // per-soul model override; falls back to OLLAMA_MODEL env var
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
  action_that_caused: ActionType | string;
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
  type: ActionType | string;
  payload: Record<string, unknown>;
  reasoning?: string;
  story_hours?: number;   // how long this action takes (in story-hours)
  description?: string;  // free-form narrative description from LLM
}

export interface ActionResult {
  action: ActionType | string;
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
  relevant_actions: string[];   // action labels that fulfill this task (any string)
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
  last_action: ActionType | string | null;
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
  world_objects: WorldObject[];
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface SoulGoal {
  id: string;
  soul_id: string;
  goal_text: string;
  formed_at: number;
  priority: 1 | 2 | 3;
  sub_goals: string[] | null;
  progress_notes: string[] | null;
  status: 'active' | 'completed' | 'abandoned';
}

// ─── Action Registry ──────────────────────────────────────────────────────────

export interface RegistryAction {
  id: string;
  label: string;
  description: string;
  vitals_effect: Partial<SoulVitals>;
  profit_delta: number;
  social_delta: number;
  prerequisites: string[] | null;
  created_by: string;
  is_collaborative: boolean;
  min_participants: number;
  max_participants: number;
  created_at: number;
}

// ─── World Objects ────────────────────────────────────────────────────────────

export interface WorldObject {
  id: string;
  type: 'furniture' | 'art' | 'note' | 'custom';
  label: string;
  owner_soul_id: string | null;
  floor: number;
  position_x: number;
  position_y: number;
  position_z: number;
  properties: Record<string, unknown> | null;
  created_by: string;
  created_at: number;
}

// ─── Joint Ventures ───────────────────────────────────────────────────────────

export interface JointVenture {
  id: string;
  initiator_id: string;
  partner_id: string;
  action_label: string;
  description: string;
  reward_split: { initiator: number; partner: number };
  status: 'negotiating' | 'active' | 'completed' | 'rejected';
  created_at: number;
  completed_at: number | null;
}

export interface VentureProposal {
  id: string;
  venture_id: string;
  from_soul_id: string;
  to_soul_id: string;
  message: string;
  response: 'accepted' | 'counter' | 'rejected' | null;
  counter_text: string | null;
  ts: number;
}

// ─── Conversations ───────────────────────────────────────────────────────────

export interface ConversationMessage {
  soul_id: string;
  soul_name: string;
  text: string;
  ts: number;
}

export interface Conversation {
  id: string;
  participant_ids: string[];
  context: string;
  messages: ConversationMessage[];
  status: 'active' | 'ended';
  started_at: number;
  ended_at: number | null;
}

// ─── Tool Results ─────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

export interface WebSearchFindings {
  query:   string;
  results: WebSearchResult[];
  source:  string;
}

export interface CodeReadResult {
  filePath:  string;
  content:   string;
  truncated: boolean;
}

export interface CodeWriteResult {
  filePath:    string;
  description: string;
  success:     boolean;
  error?:      string;
}

export interface AIConsultResult {
  question:     string;
  answer:       string;
  model:        string;
  input_tokens: number;
}

export interface ShellExecResult {
  command:  string;
  stdout:   string;
  stderr:   string;
  exitCode: number;
  timedOut: boolean;
}

export interface SoulKnowledgeRow {
  id:       string;
  soul_id:  string;
  query:    string;
  findings: string;
  source:   string;
  metadata: Record<string, unknown> | null;
  ts:       number;
}

export interface CodebaseChangeRow {
  id:          string;
  soul_id:     string;
  file_path:   string;
  description: string;
  diff:        string;
  status:      string;
  ts:          number;
}

// ─── Speech Bubbles (WebSocket) ──────────────────────────────────────────────

export interface SpeechBubbleEvent {
  type: 'SPEECH_BUBBLE';
  soul_id: string;
  soul_name: string;
  text: string;
  conversation_id: string | null;
  ts: number;
}
