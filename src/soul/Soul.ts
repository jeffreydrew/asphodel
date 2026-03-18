import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import { stripeAdapter } from '../integrations/StripeConnectAdapter';
import type {
  SoulRecord,
  SoulVitals,
  SoulIdentity,
  RewardWeights,
  WalletRow,
  QuirkRecord,
  ActionType,
  RewardComponents,
  SoulSnapshot,
  DirectiveTask,
} from '../types';

interface SoulDbRow {
  id: string;
  name: string;
  email: string;
  identity: string;
  vitals: string;
  reward_weights: string;
  is_active: number;
  created_at: number;
}

export class Soul {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly identity: SoulIdentity;
  readonly reward_weights: RewardWeights;
  readonly created_at: number;

  private _vitals: SoulVitals;
  private _is_active: boolean;
  private _last_action: ActionType | null = null;
  private _last_reward: RewardComponents | null = null;
  private _tick = 0;
  private _active_task: DirectiveTask | null = null;

  constructor(record: SoulRecord) {
    this.id             = record.id;
    this.name           = record.name;
    this.email          = record.email;
    this.identity       = record.identity;
    this.reward_weights = record.reward_weights;
    this.created_at     = record.created_at;
    this._vitals        = record.vitals;
    this._is_active     = record.is_active;
  }

  static load(soulId: string): Soul {
    const row = getDb()
      .prepare('SELECT * FROM souls WHERE id = ?')
      .get(soulId) as SoulDbRow | undefined;

    if (!row) throw new Error(`Soul ${soulId} not found`);

    const record: SoulRecord = {
      id:             row.id,
      name:           row.name,
      email:          row.email,
      identity:       JSON.parse(row.identity) as SoulIdentity,
      vitals:         JSON.parse(row.vitals) as SoulVitals,
      reward_weights: JSON.parse(row.reward_weights) as RewardWeights,
      is_active:      row.is_active === 1,
      created_at:     row.created_at,
    };

    return new Soul(record);
  }

  static loadAll(): Soul[] {
    const rows = getDb()
      .prepare('SELECT * FROM souls WHERE is_active = 1')
      .all() as SoulDbRow[];

    return rows.map(row => {
      const record: SoulRecord = {
        id:             row.id,
        name:           row.name,
        email:          row.email,
        identity:       JSON.parse(row.identity) as SoulIdentity,
        vitals:         JSON.parse(row.vitals) as SoulVitals,
        reward_weights: JSON.parse(row.reward_weights) as RewardWeights,
        is_active:      row.is_active === 1,
        created_at:     row.created_at,
      };
      return new Soul(record);
    });
  }

  get vitals(): SoulVitals                      { return this._vitals; }
  get is_active(): boolean                       { return this._is_active; }
  get tick(): number                             { return this._tick; }
  get last_reward(): RewardComponents | null     { return this._last_reward; }
  get last_action(): ActionType | null           { return this._last_action; }
  get active_task(): DirectiveTask | null        { return this._active_task; }

  setActiveTask(task: DirectiveTask | null): void {
    this._active_task = task;
  }

  advanceTask(actionType: ActionType): boolean {
    if (!this._active_task) return false;
    if (!this._active_task.relevant_actions.includes(actionType)) return false;
    this._active_task.steps_completed += 1;
    return this._active_task.steps_completed >= this._active_task.max_steps;
  }

  recentActions(limit = 10): ActionType[] {
    const rows = getDb()
      .prepare('SELECT action_that_caused FROM reward_history WHERE soul_id = ? ORDER BY tick DESC LIMIT ?')
      .all(this.id, limit) as Array<{ action_that_caused: ActionType }>;
    return rows.map(r => r.action_that_caused).reverse();
  }

  recentRewardAvg(limit = 10): number {
    const rows = getDb()
      .prepare('SELECT r_total FROM reward_history WHERE soul_id = ? ORDER BY tick DESC LIMIT ?')
      .all(this.id, limit) as Array<{ r_total: number }>;
    if (!rows.length) return 0;
    return rows.reduce((s, r) => s + r.r_total, 0) / rows.length;
  }

  observe(): { vitals: SoulVitals; wallet: WalletRow; quirks: QuirkRecord[] } {
    return {
      vitals:  this._vitals,
      wallet:  this.loadWallet(),
      quirks:  this.loadQuirks(),
    };
  }

  updateVitals(vitals: SoulVitals): void {
    this._vitals = vitals;
    getDb()
      .prepare('UPDATE souls SET vitals = ? WHERE id = ?')
      .run(JSON.stringify(vitals), this.id);
  }

  recordReward(reward: RewardComponents, action: ActionType, quirkDelta: Record<string, number>): void {
    this._last_reward = reward;
    this._last_action = action;
    this._tick += 1;

    getDb().prepare(`
      INSERT INTO reward_history
        (soul_id, tick, r_profit, r_social, r_health, r_penalty, r_total, action_that_caused, quirk_delta, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.id,
      this._tick,
      reward.r_profit,
      reward.r_social,
      reward.r_health,
      reward.r_penalty,
      reward.r_total,
      action,
      Object.keys(quirkDelta).length ? JSON.stringify(quirkDelta) : null,
      Date.now(),
    );
  }

  creditWallet(amount: number, source: string): void {
    if (amount <= 0) return;
    const db  = getDb();
    const now = Date.now();

    db.prepare(`
      UPDATE wallets
      SET balance_abstract = balance_abstract + ?,
          lifetime_earned  = lifetime_earned  + ?
      WHERE soul_id = ?
    `).run(amount, amount, this.id);

    db.prepare(`
      INSERT INTO transactions (id, soul_id, type, source, amount, ts)
      VALUES (?, ?, 'earned', ?, ?, ?)
    `).run(uuidv4(), this.id, source, amount, now);

    // Phase 5: route to Stripe when real money is enabled
    if (stripeAdapter.isEnabled()) {
      stripeAdapter.transfer(this.id, amount, source).catch(err =>
        process.stderr.write(`[Wallet/Stripe] ${String(err)}\n`),
      );
    }
  }

  snapshot(): SoulSnapshot {
    return {
      id:          this.id,
      name:        this.name,
      vitals:      this._vitals,
      wallet:      this.loadWallet(),
      quirks:      this.loadQuirks(),
      last_action: this._last_action,
      last_reward: this._last_reward,
      is_active:   this._is_active,
      active_task: this._active_task,
    };
  }

  getPendingDirectives(): string[] {
    const rows = getDb()
      .prepare('SELECT message FROM directives WHERE soul_id = ? AND injected = 0 ORDER BY ts ASC')
      .all(this.id) as Array<{ message: string }>;
    return rows.map(r => r.message);
  }

  deactivate(): void {
    this._is_active = false;
    getDb()
      .prepare('UPDATE souls SET is_active = 0 WHERE id = ?')
      .run(this.id);
  }

  private loadWallet(): WalletRow {
    return getDb()
      .prepare('SELECT * FROM wallets WHERE soul_id = ?')
      .get(this.id) as WalletRow;
  }

  private loadQuirks(): QuirkRecord[] {
    type QuirkDbRow = Omit<QuirkRecord, 'seeded' | 'persisted'> & { seeded: number; persisted: number };
    const rows = getDb()
      .prepare('SELECT * FROM quirks WHERE soul_id = ?')
      .all(this.id) as QuirkDbRow[];

    return rows.map(r => ({
      id:                  r.id,
      soul_id:             r.soul_id,
      quirk_id:            r.quirk_id,
      trigger:             r.trigger,
      strength:            r.strength,
      reinforcement_count: r.reinforcement_count,
      created_at:          r.created_at,
      seeded:    r.seeded    === 1,
      persisted: r.persisted === 1,
    }));
  }
}
