import { twitterClient } from './TwitterClient';
import type { SoulIdentity, Significance } from '../types';

// The @asphodel_tower world account — posts on significant world events.
// Uses TWITTER_WORLD_* env vars, distinct from individual soul credentials.

const WORLD_SOUL_ID = 'world';
const WORLD_IDENTITY: SoulIdentity = {
  full_name:      'Asphodel Tower',
  email:          process.env['TWITTER_WORLD_EMAIL'] ?? '',
  username_pool:  { twitter: 'asphodel_tower' },
  bio:            'Dispatches from the Asphodel Tower. Five souls, one world.',
  skills_public:  [],
  portfolio_url:  'https://asphodel.world',
  location_public: 'The Tower',
  profile_photo:  'tower.jpg',
  payment_method: 'abstract_wallet',
};

// Override env lookup to use world-specific credentials
function getWorldCreds(): { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string } | null {
  const apiKey       = process.env['TWITTER_WORLD_API_KEY'];
  const apiSecret    = process.env['TWITTER_WORLD_API_SECRET'];
  const accessToken  = process.env['TWITTER_WORLD_ACCESS_TOKEN'];
  const accessSecret = process.env['TWITTER_WORLD_ACCESS_TOKEN_SECRET'];
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

export class WorldAccount {
  isConfigured(): boolean {
    return getWorldCreds() !== null;
  }

  async announceEvent(significance: Significance, description: string, soulName?: string): Promise<void> {
    if (!this.isConfigured()) return;

    const prefix = soulName ? `🏛️ ${soulName} — ` : '🏛️ Asphodel Tower — ';
    const text   = `${prefix}${description}`.substring(0, 280);

    await twitterClient.tweet(WORLD_SOUL_ID, WORLD_IDENTITY, text);
  }

  async announceWorldMilestone(title: string, description: string): Promise<void> {
    if (!this.isConfigured()) return;

    const text = `🌐 WORLD MILESTONE: ${title}\n${description}`.substring(0, 280);
    await twitterClient.tweet(WORLD_SOUL_ID, WORLD_IDENTITY, text);
  }
}

export const worldAccount = new WorldAccount();
