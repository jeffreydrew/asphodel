import { Significance } from '../types';
import type { ActionResult, WalletRow } from '../types';

interface ClassifyInput {
  action: string;
  result: ActionResult;
  wallet: WalletRow;
  walletBefore: Pick<WalletRow, 'balance_abstract'>;
  rewardTotal: number;
}

export function classifyEvent(input: ClassifyInput): Significance {
  const { action, result, wallet, walletBefore, rewardTotal } = input;

  // SIGNIFICANT: first income ever
  if (
    result.profit_delta > 0 &&
    walletBefore.balance_abstract === 0 &&
    wallet.balance_abstract > 0
  ) {
    return Significance.SIGNIFICANT;
  }

  // SIGNIFICANT: wallet crosses $100 boundary
  if (walletBefore.balance_abstract < 100 && wallet.balance_abstract >= 100) {
    return Significance.SIGNIFICANT;
  }

  // SIGNIFICANT: wallet crosses $500 boundary
  if (walletBefore.balance_abstract < 500 && wallet.balance_abstract >= 500) {
    return Significance.SIGNIFICANT;
  }

  // SIGNIFICANT: first ever content published (soul has created at least once)
  if (/create_content|write_book|create_art/.test(action) && result.success && wallet.lifetime_earned === result.profit_delta) {
    return Significance.SIGNIFICANT;
  }

  // NOTABLE: high-value actions
  if (/submit_application|create_content|social_post|meet_soul|write_book|create_art/.test(action)) {
    return Significance.NOTABLE;
  }

  // NOTABLE: strong reward
  if (rewardTotal > 0.3) {
    return Significance.NOTABLE;
  }

  return Significance.ROUTINE;
}
