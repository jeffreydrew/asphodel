import type { SoulVitals, RewardWeights, ActionResult, RewardComponents } from '../types';

// Normalises a delta into [-1, 1] given a max possible change.
function normalise(delta: number, maxDelta: number): number {
  if (maxDelta === 0) return 0;
  return Math.max(-1, Math.min(1, delta / maxDelta));
}

function scoreHealthDelta(before: SoulVitals, after: SoulVitals): number {
  // Positive: hunger decreasing, energy increasing, health increasing,
  //           happiness increasing, sleep_debt decreasing.
  const hungerDelta   = before.hunger     - after.hunger;      // lower is better
  const energyDelta   = after.energy      - before.energy;
  const healthDelta   = after.health      - before.health;
  const happinessDelta = after.happiness  - before.happiness;
  const sleepDelta    = before.sleep_debt - after.sleep_debt;  // lower debt is better

  const raw =
    normalise(hungerDelta, 30) * 0.25 +
    normalise(energyDelta, 30) * 0.25 +
    normalise(healthDelta, 20) * 0.20 +
    normalise(happinessDelta, 20) * 0.15 +
    normalise(sleepDelta, 30) * 0.15;

  return raw;
}

function scoreProfitDelta(result: ActionResult): number {
  // Normalise against a max expected single-action earn of $5
  return normalise(result.profit_delta, 5);
}

function scoreSocialDelta(result: ActionResult): number {
  // Social delta is 0–100 points; normalise against max of 40
  return normalise(result.social_delta, 40);
}

function computePenalty(result: ActionResult): number {
  let penalty = 0;
  if (result.tos_violation)     penalty += 0.5;
  if (result.deceptive_content) penalty += 0.4;
  if (result.penalty > 0)       penalty += normalise(result.penalty, 1);
  return Math.min(1, penalty);
}

export function scoreReward(
  weights: RewardWeights,
  vitalsBefore: SoulVitals,
  vitalsAfter: SoulVitals,
  result: ActionResult,
): RewardComponents {
  const r_profit  = scoreProfitDelta(result);
  const r_social  = scoreSocialDelta(result);
  const r_health  = scoreHealthDelta(vitalsBefore, vitalsAfter);
  const r_penalty = computePenalty(result);

  const r_total =
    weights.w1_profit * r_profit +
    weights.w2_social * r_social +
    weights.w3_health * r_health -
    r_penalty;

  return {
    r_profit:  round(r_profit),
    r_social:  round(r_social),
    r_health:  round(r_health),
    r_penalty: round(r_penalty),
    r_total:   round(r_total),
  };
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
