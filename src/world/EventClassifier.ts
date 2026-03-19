import { Significance } from '../types';
import type { ActionResult, WalletRow, SoulGoal } from '../types';

export interface ClassifyInput {
  action: string;
  result: ActionResult;
  wallet: WalletRow;
  walletBefore: Pick<WalletRow, 'balance_abstract'>;
  rewardTotal: number;
  activeGoal?: SoulGoal | null;
  soulNames?: string[];
}

// Biological / maintenance actions are always ROUTINE, regardless of reward
const BIOLOGICAL_PATTERN = /^(eat|rest|nap|sleep|exercise|idle|meditate|stretch|walk|wander|cook)/;

// Check whether action description/label overlaps meaningfully with goal text (≥2 content words)
function hasGoalKeywordOverlap(actionText: string, goalText: string): boolean {
  const stopWords = new Set([
    'a', 'an', 'the', 'to', 'of', 'in', 'and', 'or', 'is', 'for',
    'my', 'i', 'me', 'it', 'be', 'at', 'on', 'by', 'do', 'we',
  ]);
  const goalWords = goalText
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  const descLower = actionText.toLowerCase();
  const matches = goalWords.filter(w => descLower.includes(w));
  return matches.length >= 2;
}

export function classifyEvent(input: ClassifyInput): Significance {
  const { action, result, wallet, walletBefore, rewardTotal } = input;
  const { activeGoal, soulNames } = input;
  const llmHint = result.metadata['llm_significance'] as string | undefined;

  // ── 1. Force ROUTINE for all biological / maintenance actions ───────────────
  if (BIOLOGICAL_PATTERN.test(action)) {
    return Significance.ROUTINE;
  }

  // ── 2. SIGNIFICANT checks ───────────────────────────────────────────────────

  // First income ever
  if (
    result.profit_delta > 0 &&
    walletBefore.balance_abstract === 0 &&
    wallet.balance_abstract > 0
  ) {
    return Significance.SIGNIFICANT;
  }

  // Wallet milestone: crosses $100
  if (walletBefore.balance_abstract < 100 && wallet.balance_abstract >= 100) {
    return Significance.SIGNIFICANT;
  }

  // Wallet milestone: crosses $500
  if (walletBefore.balance_abstract < 500 && wallet.balance_abstract >= 500) {
    return Significance.SIGNIFICANT;
  }

  // First-ever content published (lifetime_earned equals this profit_delta → first earnings)
  if (
    /create_content|write_book|create_art/.test(action) &&
    result.success &&
    wallet.lifetime_earned === result.profit_delta
  ) {
    return Significance.SIGNIFICANT;
  }

  // Goal advancement: description or action label overlaps with active goal text
  if (
    activeGoal &&
    hasGoalKeywordOverlap(`${action} ${result.description}`, activeGoal.goal_text)
  ) {
    return Significance.SIGNIFICANT;
  }

  // LLM self-reported SIGNIFICANT
  if (llmHint === 'SIGNIFICANT') {
    return Significance.SIGNIFICANT;
  }

  // ── 3. NOTABLE checks ───────────────────────────────────────────────────────

  // High-value creative / social action types
  if (/submit_application|create_content|social_post|meet_soul|write_book|create_art/.test(action)) {
    return Significance.NOTABLE;
  }

  // Description mentions a neighbour by first name
  if (soulNames && soulNames.length > 0) {
    const descLower = result.description.toLowerCase();
    const mentionsNeighbour = soulNames.some(fullName => {
      const firstName = (fullName.split(' ')[0] ?? '').toLowerCase();
      return firstName.length > 1 && descLower.includes(firstName);
    });
    if (mentionsNeighbour) return Significance.NOTABLE;
  }

  // LLM self-reported NOTABLE
  if (llmHint === 'NOTABLE') {
    return Significance.NOTABLE;
  }

  // Strong reward signal (non-biological already filtered above)
  if (rewardTotal > 0.3) {
    return Significance.NOTABLE;
  }

  // ── 4. Everything else ──────────────────────────────────────────────────────
  return Significance.ROUTINE;
}
