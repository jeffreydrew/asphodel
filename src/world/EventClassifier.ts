import { ActionType, Significance } from '../types';
import type { ActionResult, WalletRow } from '../types';

interface ClassifyInput {
  action: ActionType;
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
  if (action === ActionType.CREATE_CONTENT && result.success && wallet.lifetime_earned === result.profit_delta) {
    return Significance.SIGNIFICANT;
  }

  // NOTABLE: high-value actions
  if (
    action === ActionType.SUBMIT_APP ||
    action === ActionType.CREATE_CONTENT ||
    action === ActionType.SOCIAL_POST ||
    action === ActionType.MEET_SOUL
  ) {
    return Significance.NOTABLE;
  }

  // NOTABLE: strong reward
  if (rewardTotal > 0.3) {
    return Significance.NOTABLE;
  }

  return Significance.ROUTINE;
}
