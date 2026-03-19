import type { Action, SoulVitals, RewardWeights, QuirkRecord, RewardComponents } from '../types';

// Fallback deterministic decision logic based on vitals + quirks.
// Used when Ollama is offline. Uses string labels matching registry seeds.

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
    if (vitals.hunger > 75) return { type: 'eat', payload: {} };
    if (vitals.sleep_debt > 80 || vitals.energy < 15) return { type: 'rest', payload: {} };
    if (vitals.health < 30) return { type: 'exercise', payload: {} };

    // ── Priority 2: quirk overrides ──────────────────────────────────────────

    // marketplace_hustler: frequently searches for opportunities online
    const hustler = persistedQuirks.find(q => q.quirk_id === 'marketplace_hustler');
    if (hustler && Math.random() < hustler.strength * 0.4) {
      return { type: 'search_web', payload: {} };
    }

    // recluse: avoids social when unhappy
    const recluse = persistedQuirks.find(q => q.quirk_id === 'recluse' && vitals.happiness < 40);
    if (recluse) {
      return {
        type: weightedRandom(
          ['browse_web', 'create_content', 'exercise', 'idle'],
          [0.40, 0.35, 0.15, 0.10],
        ),
        payload: {},
      };
    }

    // compulsive_helper: seek social interaction
    const helper = persistedQuirks.find(q => q.quirk_id === 'compulsive_helper');
    if (helper && Math.random() < helper.strength * 0.5) {
      return { type: 'meet_soul', payload: {} };
    }

    // ── Priority 3: health maintenance ──────────────────────────────────────
    if (vitals.health < 50 && Math.random() < 0.4) {
      return { type: 'exercise', payload: {} };
    }

    // ── Priority 5: weighted random based on soul's reward weights ───────────
    const candidates = [
      'search_web',
      'create_content',
      'meet_soul',
      'social_post',
      'exercise',
      'read_book',
      'write_book',
      'create_art',
      'browse_web',
      'idle',
    ];

    const candidateWeights = [
      weights.w1_profit * 0.60,
      weights.w1_profit * 0.40 + weights.w2_social * 0.30,
      weights.w2_social * 0.50,
      weights.w2_social * 0.30,
      weights.w3_health * 0.60,
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
