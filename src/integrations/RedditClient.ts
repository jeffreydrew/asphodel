import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import type { SoulIdentity } from '../types';

// Reddit OAuth2 "script" app flow.
// Each soul can have their own credentials, or fall back to shared.

function getSoulCreds(soulName: string): {
  clientId: string; clientSecret: string; username: string; password: string;
} | null {
  const key         = soulName.toUpperCase().replace(/\s+/g, '_');
  const clientId     = process.env[`REDDIT_${key}_CLIENT_ID`]     ?? process.env['REDDIT_CLIENT_ID'];
  const clientSecret = process.env[`REDDIT_${key}_CLIENT_SECRET`] ?? process.env['REDDIT_CLIENT_SECRET'];
  const username     = process.env[`REDDIT_${key}_USERNAME`]      ?? process.env['REDDIT_USERNAME'];
  const password     = process.env[`REDDIT_${key}_PASSWORD`]      ?? process.env['REDDIT_PASSWORD'];

  if (!clientId || !clientSecret || !username || !password) return null;
  return { clientId, clientSecret, username, password };
}

// Per-soul access token cache (in-memory, expires ~1h)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(soulName: string): Promise<string | null> {
  const creds = getSoulCreds(soulName);
  if (!creds) return null;

  const cached = tokenCache.get(soulName);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'User-Agent':    'asphodel-world/1.0',
      },
      body:   `grant_type=password&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };

    tokenCache.set(soulName, {
      token:     data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

// Pick a subreddit based on soul skills/identity
function pickSubreddit(identity: SoulIdentity): string {
  const skill = identity.skills_public[0]?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    copywriting:    'freelancewriters',
    'data entry':   'beermoney',
    research:       'samplesize',
    writing:        'freelancewriters',
    tutoring:       'learnprogramming',
    communication:  'socialskills',
  };
  for (const [k, v] of Object.entries(map)) {
    if (skill.includes(k)) return v;
  }
  return 'beermoney';
}

export class RedditClient {
  isConfigured(soulName: string): boolean {
    return getSoulCreds(soulName) !== null;
  }

  async post(
    soulId: string,
    identity: SoulIdentity,
    text: string,
    subreddit?: string,
  ): Promise<{ success: boolean; postId: string | null }> {
    const token = await getAccessToken(identity.full_name);
    if (!token) return { success: false, postId: null };

    const sub    = subreddit ?? pickSubreddit(identity);
    const title  = text.length > 100 ? text.substring(0, 97) + '…' : text;
    const isSelf = true;

    try {
      const res = await fetch('https://oauth.reddit.com/api/submit', {
        method:  'POST',
        headers: {
          'Authorization': `bearer ${token}`,
          'User-Agent':    'asphodel-world/1.0',
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          sr:       sub,
          kind:     isSelf ? 'self' : 'link',
          title,
          text:     isSelf ? text : '',
          resubmit: 'true',
          nsfw:     'false',
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        process.stderr.write(`[Reddit] ${res.status}\n`);
        return { success: false, postId: null };
      }

      const data   = await res.json() as { json: { data: { name: string } } };
      const postId = data.json?.data?.name ?? null;

      getDb().prepare(`
        INSERT INTO social_posts (id, soul_id, platform, external_id, content, ts)
        VALUES (?, ?, 'reddit', ?, ?, ?)
      `).run(uuidv4(), soulId, postId, text, Date.now());

      process.stdout.write(`[Reddit] u/${identity.username_pool['reddit'] ?? identity.full_name} → r/${sub}: "${title.substring(0, 60)}"\n`);
      return { success: true, postId };
    } catch (err) {
      process.stderr.write(`[Reddit] Error: ${String(err)}\n`);
      return { success: false, postId: null };
    }
  }
}

export const redditClient = new RedditClient();
