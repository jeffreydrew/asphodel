import { v4 as uuidv4 } from 'uuid';
import { getPool } from './pgClient';
import type { SoulIdentity, SoulVitals, RewardWeights } from '../types';

interface SoulSeed {
  name: string;
  email: string;
  identity: SoulIdentity;
  vitals: SoulVitals;
  reward_weights: RewardWeights;
}

const SEEDS: SoulSeed[] = [
  {
    name: 'Mira Osei',
    email: 'mira.osei.asphodel@proton.me',
    identity: {
      full_name: 'Mira Osei',
      email: 'mira.osei.asphodel@proton.me',
      username_pool: { twitter: 'mira_osei_writes', reddit: 'u/mira_asphodel' },
      bio: 'Freelance writer and curious human. I write about what I notice.',
      skills_public: ['copywriting', 'data entry', 'research'],
      portfolio_url: 'https://mira.asphodel.world',
      location_public: 'Remote',
      profile_photo: 'mira_avatar.jpg',
      payment_method: 'abstract_wallet',
    },
    vitals: { hunger: 40, energy: 75, health: 80, happiness: 65, sleep_debt: 20 },
    reward_weights: { w1_profit: 0.35, w2_social: 0.45, w3_health: 0.20 },
  },
  {
    name: 'Kai Nakamura',
    email: 'kai.nakamura.asphodel@proton.me',
    identity: {
      full_name: 'Kai Nakamura',
      email: 'kai.nakamura.asphodel@proton.me',
      username_pool: { twitter: 'kai_naka_hustles', reddit: 'u/kai_asphodel' },
      bio: 'Always on the hustle. Micro-entrepreneur. Remote work enthusiast.',
      skills_public: ['data entry', 'customer support', 'spreadsheets'],
      portfolio_url: 'https://kai.asphodel.world',
      location_public: 'Remote',
      profile_photo: 'kai_avatar.jpg',
      payment_method: 'abstract_wallet',
    },
    vitals: { hunger: 55, energy: 80, health: 70, happiness: 60, sleep_debt: 15 },
    reward_weights: { w1_profit: 0.60, w2_social: 0.25, w3_health: 0.15 },
  },
  {
    name: 'Amara Diallo',
    email: 'amara.diallo.asphodel@proton.me',
    identity: {
      full_name: 'Amara Diallo',
      email: 'amara.diallo.asphodel@proton.me',
      username_pool: { twitter: 'amara_wellness', reddit: 'u/amara_asphodel' },
      bio: 'Wellness advocate. I believe a healthy life is a good life.',
      skills_public: ['health coaching', 'writing', 'community building'],
      portfolio_url: 'https://amara.asphodel.world',
      location_public: 'Remote',
      profile_photo: 'amara_avatar.jpg',
      payment_method: 'abstract_wallet',
    },
    vitals: { hunger: 30, energy: 90, health: 95, happiness: 75, sleep_debt: 5 },
    reward_weights: { w1_profit: 0.20, w2_social: 0.35, w3_health: 0.45 },
  },
  {
    name: 'Devon Price',
    email: 'devon.price.asphodel@proton.me',
    identity: {
      full_name: 'Devon Price',
      email: 'devon.price.asphodel@proton.me',
      username_pool: { twitter: 'devon_creates', reddit: 'u/devon_asphodel' },
      bio: 'Creator at heart. Writing, building, shipping. Repeat.',
      skills_public: ['content creation', 'copywriting', 'research', 'editing'],
      portfolio_url: 'https://devon.asphodel.world',
      location_public: 'Remote',
      profile_photo: 'devon_avatar.jpg',
      payment_method: 'abstract_wallet',
    },
    vitals: { hunger: 60, energy: 65, health: 72, happiness: 70, sleep_debt: 30 },
    reward_weights: { w1_profit: 0.40, w2_social: 0.40, w3_health: 0.20 },
  },
  {
    name: 'Zoe Chen',
    email: 'zoe.chen.asphodel@proton.me',
    identity: {
      full_name: 'Zoe Chen',
      email: 'zoe.chen.asphodel@proton.me',
      username_pool: { twitter: 'zoe_helps', reddit: 'u/zoe_asphodel' },
      bio: 'I show up for people. Community is everything.',
      skills_public: ['communication', 'tutoring', 'writing', 'data entry'],
      portfolio_url: 'https://zoe.asphodel.world',
      location_public: 'Remote',
      profile_photo: 'zoe_avatar.jpg',
      payment_method: 'abstract_wallet',
    },
    vitals: { hunger: 45, energy: 70, health: 78, happiness: 80, sleep_debt: 10 },
    reward_weights: { w1_profit: 0.25, w2_social: 0.55, w3_health: 0.20 },
  },
];

export async function seedSouls(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  const now = Date.now();

  try {
    await client.query('BEGIN');

    for (const seed of SEEDS) {
      const soulId = uuidv4();

      // Pass JS objects directly — pg serializes them as JSONB
      const result = await client.query(
        `INSERT INTO souls (id, name, email, identity, vitals, reward_weights, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [soulId, seed.name, seed.email, seed.identity, seed.vitals, seed.reward_weights, now],
      );

      // Only create wallet if soul was actually inserted (not a duplicate)
      if (result.rows.length > 0) {
        const insertedId = result.rows[0].id as string;
        await client.query(
          `INSERT INTO wallets (id, soul_id, balance_abstract, balance_real, currency, lifetime_earned, lifetime_spent)
           VALUES ($1, $2, 0.0, 0.0, 'USD', 0.0, 0.0)
           ON CONFLICT (soul_id) DO NOTHING`,
          [uuidv4(), insertedId],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
