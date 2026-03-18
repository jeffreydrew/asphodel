import Stripe from 'stripe';
import { getPool } from '../db/pgClient';

const STRIPE_SECRET = process.env['STRIPE_SECRET_KEY'];
const ENABLE_REAL   = process.env['ENABLE_REAL_MONEY'] === 'true';

let _stripe: Stripe | null = null;

function getStripe(): Stripe | null {
  if (!STRIPE_SECRET) return null;
  if (!_stripe) _stripe = new Stripe(STRIPE_SECRET);
  return _stripe;
}

export class StripeConnectAdapter {
  isEnabled(): boolean {
    return ENABLE_REAL && !!STRIPE_SECRET;
  }

  async createAccount(soulId: string, email: string): Promise<string | null> {
    const stripe = getStripe();
    if (!stripe) return null;

    try {
      const account = await stripe.accounts.create({
        type:         'express',
        email,
        capabilities: { transfers: { requested: true } },
      });

      await getPool().query(
        `INSERT INTO stripe_accounts (soul_id, stripe_account_id, status, created_at)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT (soul_id) DO NOTHING`,
        [soulId, account.id, Date.now()],
      );

      return account.id;
    } catch (err) {
      process.stderr.write(`[Stripe] createAccount error: ${String(err)}\n`);
      return null;
    }
  }

  async transfer(soulId: string, amountUsd: number, source: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const stripe = getStripe();
    if (!stripe) return false;

    const { rows } = await getPool().query(
      'SELECT stripe_account_id FROM stripe_accounts WHERE soul_id = $1',
      [soulId],
    );
    const row = rows[0] as { stripe_account_id: string } | undefined;

    if (!row) {
      process.stderr.write(`[Stripe] No account for soul ${soulId}\n`);
      return false;
    }

    try {
      await stripe.transfers.create({
        amount:         Math.round(amountUsd * 100),
        currency:       'usd',
        destination:    row.stripe_account_id,
        transfer_group: `asphodel_${soulId}`,
        metadata:       { soul_id: soulId, source },
      });

      process.stdout.write(`[Stripe] Transferred $${amountUsd.toFixed(2)} to soul ${soulId} (${source})\n`);
      return true;
    } catch (err) {
      process.stderr.write(`[Stripe] transfer error: ${String(err)}\n`);
      return false;
    }
  }
}

export const stripeAdapter = new StripeConnectAdapter();
