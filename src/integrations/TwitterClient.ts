import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import type { SoulIdentity } from '../types';

// ─── OAuth 1.0a ───────────────────────────────────────────────────────────────
// Implemented with Node built-in crypto — no external OAuth library needed.

function oauthSign(params: {
  method: string;
  url: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  body?: Record<string, string>;
}): string {
  const { method, url, apiKey, apiSecret, accessToken, accessSecret, body = {} } = params;

  const nonce     = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     apiKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_token:            accessToken,
    oauth_version:          '1.0',
  };

  const allParams = { ...oauthParams, ...body };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys
    .map(k => `${pct(k)}=${pct(allParams[k]!)}`)
    .join('&');

  const base  = `${method.toUpperCase()}&${pct(url)}&${pct(paramStr)}`;
  const key   = `${pct(apiSecret)}&${pct(accessSecret)}`;
  const sig   = crypto.createHmac('sha1', key).update(base).digest('base64');

  oauthParams['oauth_signature'] = sig;

  const header = 'OAuth ' + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ');

  return header;
}

function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// ─── Twitter Client ───────────────────────────────────────────────────────────

function getSoulCreds(soulName: string): {
  apiKey: string; apiSecret: string; accessToken: string; accessSecret: string;
} | null {
  const key = soulName.toUpperCase().replace(/\s+/g, '_');
  const apiKey      = process.env[`TWITTER_${key}_API_KEY`]          ?? process.env['TWITTER_API_KEY'];
  const apiSecret   = process.env[`TWITTER_${key}_API_SECRET`]        ?? process.env['TWITTER_API_SECRET'];
  const accessToken = process.env[`TWITTER_${key}_ACCESS_TOKEN`]      ?? process.env['TWITTER_ACCESS_TOKEN'];
  const accessSecret = process.env[`TWITTER_${key}_ACCESS_TOKEN_SECRET`] ?? process.env['TWITTER_ACCESS_TOKEN_SECRET'];

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

export class TwitterClient {
  isConfigured(soulName: string): boolean {
    return getSoulCreds(soulName) !== null;
  }

  async tweet(
    soulId: string,
    identity: SoulIdentity,
    text: string,
  ): Promise<{ success: boolean; tweetId: string | null }> {
    const creds = getSoulCreds(identity.full_name);
    if (!creds) return { success: false, tweetId: null };

    const url    = 'https://api.twitter.com/2/tweets';
    const body   = { text: text.substring(0, 280) };
    const authHeader = oauthSign({
      method:      'POST',
      url,
      ...creds,
      body:        {},
    });

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const t = await res.text();
        process.stderr.write(`[Twitter] ${res.status}: ${t.substring(0, 200)}\n`);
        return { success: false, tweetId: null };
      }

      const data    = await res.json() as { data: { id: string } };
      const tweetId = data.data?.id ?? null;

      getDb().prepare(`
        INSERT INTO social_posts (id, soul_id, platform, external_id, content, ts)
        VALUES (?, ?, 'twitter', ?, ?, ?)
      `).run(uuidv4(), soulId, tweetId, text, Date.now());

      process.stdout.write(`[Twitter] @${identity.username_pool['twitter'] ?? identity.full_name}: "${text.substring(0, 60)}…"\n`);
      return { success: true, tweetId };
    } catch (err) {
      process.stderr.write(`[Twitter] Error: ${String(err)}\n`);
      return { success: false, tweetId: null };
    }
  }
}

export const twitterClient = new TwitterClient();
