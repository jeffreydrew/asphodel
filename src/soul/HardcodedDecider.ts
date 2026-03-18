import { ActionType } from '../types';
import type { Action, SoulVitals, RewardWeights, QuirkRecord, RewardComponents } from '../types';

// Phase 1: deterministic decision logic based on vitals + quirks.
// Phase 2: delete this file and replace with LLMDecider (same signature).

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export class HardcodedDecider {
  decide(
    vitals: SoulVitals,
    weights: RewardWeights,
    quirks: QuirkRecord[],
    lastReward: RewardComponents | null,
  ): Action {
    const persistedQuirks = quirks.filter(q => q.persisted);

    // ── Priority 1: urgent biological needs ─────────────────────────────────
    if (vitals.hunger > 75) return { type: ActionType.EAT, payload: {} };
    if (vitals.sleep_debt > 80 || vitals.energy < 15) return { type: ActionType.REST, payload: {} };
    if (vitals.health < 30) return { type: ActionType.EXERCISE, payload: {} };

    // ── Priority 2: quirk overrides ──────────────────────────────────────────

    // marketplace_hustler: frequently checks job boards
    const hustler = persistedQuirks.find(q => q.quirk_id === 'marketplace_hustler');
    if (hustler && Math.random() < hustler.strength * 0.4) {
      return { type: ActionType.BROWSE_JOBS, payload: {} };
    }

    // recluse: avoids social when unhappy
    const recluse = persistedQuirks.find(q => q.quirk_id === 'recluse' && vitals.happiness < 40);
    if (recluse) {
      return {
        type: weightedRandom(
          [ActionType.BROWSE_JOBS, ActionType.CREATE_CONTENT, ActionType.EXERCISE, ActionType.IDLE],
          [0.40, 0.35, 0.15, 0.10],
        ),
        payload: {},
      };
    }

    // compulsive_helper: seek social interaction
    const helper = persistedQuirks.find(q => q.quirk_id === 'compulsive_helper');
    if (helper && Math.random() < helper.strength * 0.5) {
      return { type: ActionType.MEET_SOUL, payload: {} };
    }

    // ── Priority 3: health maintenance ──────────────────────────────────────
    if (vitals.health < 50 && Math.random() < 0.4) {
      return { type: ActionType.EXERCISE, payload: {} };
    }

    // ── Priority 4: submit if we browsed last tick and found jobs ────────────
    if (lastReward && lastReward.r_profit > 0 && Math.random() < 0.5) {
      return { type: ActionType.SUBMIT_APP, payload: {} };
    }

    // ── Priority 5: weighted random based on soul's reward weights ───────────
    const candidates: ActionType[] = [
      ActionType.BROWSE_JOBS,
      ActionType.CREATE_CONTENT,
      ActionType.MEET_SOUL,
      ActionType.SOCIAL_POST,
      ActionType.EXERCISE,
      ActionType.READ_BOOK,
      ActionType.WRITE_BOOK,
      ActionType.CREATE_ART,
      ActionType.BROWSE_WEB,
      ActionType.IDLE,
    ];

    const candidateWeights = [
      weights.w1_profit * 0.60,
      weights.w1_profit * 0.40 + weights.w2_social * 0.30,
      weights.w2_social * 0.50,
      weights.w2_social * 0.30,
      weights.w3_health * 0.60,
      // Library: creativity + happiness weighted
      weights.w2_social * 0.20 + weights.w3_health * 0.10,
      weights.w1_profit * 0.20 + weights.w2_social * 0.20,
      weights.w2_social * 0.25,
      weights.w1_profit * 0.15 + 0.05,
      0.05,
    ];

    return {
      type:    weightedRandom(candidates, candidateWeights),
      payload: {},
    };
  }
}
