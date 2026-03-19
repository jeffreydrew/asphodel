import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/pgClient';
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

// pg returns JSONB as JS objects and BOOLEAN as JS boolean — no manual parsing needed
interface SoulDbRow {
  id: string;
  name: string;
  email: string;
  identity: SoulIdentity;
  vitals: SoulVitals;
  reward_weights: RewardWeights;
  is_active: boolean;
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
  private _last_action: ActionType | string | null = null;
  private _last_reward: RewardComponents | null = null;
  private _tick = 0;
  private _active_task: DirectiveTask | null = null;
  private _action_end_time = 0;

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

  static async load(soulId: string): Promise<Soul> {
    const { rows } = await getPool().query(
      'SELECT * FROM souls WHERE id = $1',
      [soulId],
    );
    const row = rows[0] as SoulDbRow | undefined;
    if (!row) throw new Error(`Soul ${soulId} not found`);

    const soul = new Soul({
      id:             row.id,
      name:           row.name,
      email:          row.email,
      identity:       row.identity,
      vitals:         row.vitals,
      reward_weights: row.reward_weights,
      is_active:      row.is_active,
      created_at:     row.created_at,
    });

    const { rows: tickRows } = await getPool().query<{ max_tick: number | null }>(
      'SELECT MAX(tick) as max_tick FROM reward_history WHERE soul_id = $1',
      [row.id],
    );
    soul._tick = Number(tickRows[0]?.max_tick ?? 0);

    return soul;
  }

  static async loadAll(): Promise<Soul[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM souls WHERE is_active = TRUE',
    );

    const souls = (rows as SoulDbRow[]).map(row => new Soul({
      id:             row.id,
      name:           row.name,
      email:          row.email,
      identity:       row.identity,
      vitals:         row.vitals,
      reward_weights: row.reward_weights,
      is_active:      row.is_active,
      created_at:     row.created_at,
    }));

    if (souls.length > 0) {
      const { rows: tickRows } = await getPool().query<{ soul_id: string; max_tick: number | null }>(
        'SELECT soul_id, MAX(tick) as max_tick FROM reward_history WHERE soul_id = ANY($1) GROUP BY soul_id',
        [souls.map(s => s.id)],
      );
      const tickMap = new Map(tickRows.map(r => [r.soul_id, Number(r.max_tick ?? 0)]));
      souls.forEach(s => { s._tick = tickMap.get(s.id) ?? 0; });
    }

    return souls;
  }

  get vitals(): SoulVitals                      { return this._vitals; }
  get is_active(): boolean                       { return this._is_active; }
  get tick(): number                             { return this._tick; }
  get last_reward(): RewardComponents | null     { return this._last_reward; }
  get last_action(): ActionType | string | null  { return this._last_action; }
  get active_task(): DirectiveTask | null        { return this._active_task; }
  get actionEndTime(): number                    { return this._action_end_time; }

  setActionEndTime(ms: number): void { this._action_end_time = ms; }

  setActiveTask(task: DirectiveTask | null): void {
    this._active_task = task;
  }

  advanceTask(actionType: ActionType | string): boolean {
    if (!this._active_task) return false;
    if (!(this._active_task.relevant_actions as string[]).includes(actionType)) return false;
    this._active_task.steps_completed += 1;
    return this._active_task.steps_completed >= this._active_task.max_steps;
  }

  async recentActions(limit = 10): Promise<(ActionType | string)[]> {
    const { rows } = await getPool().query(
      'SELECT action_that_caused FROM reward_history WHERE soul_id = $1 ORDER BY tick DESC LIMIT $2',
      [this.id, limit],
    );
    return (rows as Array<{ action_that_caused: ActionType | string }>)
      .map(r => r.action_that_caused)
      .reverse();
  }

  async recentRewardAvg(limit = 10): Promise<number> {
    const { rows } = await getPool().query(
      'SELECT r_total FROM reward_history WHERE soul_id = $1 ORDER BY tick DESC LIMIT $2',
      [this.id, limit],
    );
    if (!rows.length) return 0;
    return (rows as Array<{ r_total: number }>).reduce((s, r) => s + r.r_total, 0) / rows.length;
  }

  async observe(): Promise<{ vitals: SoulVitals; wallet: WalletRow; quirks: QuirkRecord[] }> {
    return {
      vitals:  this._vitals,
      wallet:  await this.loadWallet(),
      quirks:  await this.loadQuirks(),
    };
  }

  async updateVitals(vitals: SoulVitals): Promise<void> {
    this._vitals = vitals;
    await getPool().query(
      'UPDATE souls SET vitals = $1 WHERE id = $2',
      [vitals, this.id],
    );
  }

  async recordReward(
    reward: RewardComponents,
    action: ActionType | string,
    quirkDelta: Record<string, number>,
  ): Promise<void> {
    this._last_reward = reward;
    this._last_action = action;
    this._tick += 1;

    await getPool().query(
      `INSERT INTO reward_history
         (soul_id, tick, r_profit, r_social, r_health, r_penalty, r_total, action_that_caused, quirk_delta, ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        this.id,
        this._tick,
        reward.r_profit,
        reward.r_social,
        reward.r_health,
        reward.r_penalty,
        reward.r_total,
        action,
        Object.keys(quirkDelta).length ? quirkDelta : null,
        Date.now(),
      ],
    );
  }

  async creditWallet(amount: number, source: string): Promise<void> {
    if (amount <= 0) return;
    const pool = getPool();
    const now  = Date.now();

    await pool.query(
      `UPDATE wallets
       SET balance_abstract = balance_abstract + $1,
           lifetime_earned  = lifetime_earned  + $1
       WHERE soul_id = $2`,
      [amount, this.id],
    );

    await pool.query(
      `INSERT INTO transactions (id, soul_id, type, source, amount, ts)
       VALUES ($1, $2, 'earned', $3, $4, $5)`,
      [uuidv4(), this.id, source, amount, now],
    );

    if (stripeAdapter.isEnabled()) {
      stripeAdapter.transfer(this.id, amount, source).catch(err =>
        process.stderr.write(`[Wallet/Stripe] ${String(err)}\n`),
      );
    }
  }

  async snapshot(): Promise<SoulSnapshot> {
    return {
      id:          this.id,
      name:        this.name,
      vitals:      this._vitals,
      wallet:      await this.loadWallet(),
      quirks:      await this.loadQuirks(),
      last_action: this._last_action,
      last_reward: this._last_reward,
      is_active:   this._is_active,
      active_task: this._active_task,
    };
  }

  async deactivate(): Promise<void> {
    this._is_active = false;
    await getPool().query('UPDATE souls SET is_active = FALSE WHERE id = $1', [this.id]);
  }

  private async loadWallet(): Promise<WalletRow> {
    const { rows } = await getPool().query(
      'SELECT * FROM wallets WHERE soul_id = $1',
      [this.id],
    );
    return rows[0] as WalletRow;
  }

  private async loadQuirks(): Promise<QuirkRecord[]> {
    const { rows } = await getPool().query(
      'SELECT * FROM quirks WHERE soul_id = $1',
      [this.id],
    );
    // pg returns BOOLEAN columns as JS boolean — no === 1 cast needed
    return rows as QuirkRecord[];
  }
}
