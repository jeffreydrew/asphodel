import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client';
import type { SoulIdentity } from '../types';

const GHOST_URL = process.env['GHOST_URL'];
const GHOST_KEY = process.env['GHOST_ADMIN_KEY']; // format: "id:secret"

function generateGhostJWT(id: string, secret: string): string {
  const now     = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const sig     = crypto
    .createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export class GhostPublisher {
  isConfigured(): boolean {
    return !!(GHOST_URL && GHOST_KEY);
  }

  async publish(
    soulId: string,
    identity: SoulIdentity,
    title: string,
    bodyText: string,
  ): Promise<{ success: boolean; url: string | null }> {
    if (!this.isConfigured()) return { success: false, url: null };

    const [keyId, secret] = GHOST_KEY!.split(':');
    if (!keyId || !secret) {
      process.stderr.write('[Ghost] Invalid GHOST_ADMIN_KEY format (expected "id:secret")\n');
      return { success: false, url: null };
    }

    const token    = generateGhostJWT(keyId, secret);
    const htmlBody = bodyText.split('\n\n').map(p => `<p>${p.trim()}</p>`).join('\n');
    const slug     = identity.full_name.toLowerCase().replace(/\s+/g, '-');
    const tag      = slug;

    try {
      const res = await fetch(`${GHOST_URL}/ghost/api/admin/posts/`, {
        method:  'POST',
        headers: { 'Authorization': `Ghost ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: [{
            title,
            html:       htmlBody,
            status:     'published',
            tags:       [{ name: tag }],
            custom_excerpt: bodyText.substring(0, 150),
          }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const text = await res.text();
        process.stderr.write(`[Ghost] Publish failed ${res.status}: ${text.substring(0, 200)}\n`);
        return { success: false, url: null };
      }

      const data   = await res.json() as { posts: Array<{ id: string; url: string }> };
      const post   = data.posts[0];
      const postId = post?.id ?? null;
      const url    = post?.url ?? null;

      if (postId) {
        getDb().prepare(`
          INSERT INTO ghost_posts (id, soul_id, ghost_post_id, title, url, ts)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), soulId, postId, title, url, Date.now());
      }

      process.stdout.write(`[Ghost] Published: "${title}" → ${url}\n`);
      return { success: true, url };
    } catch (err) {
      process.stderr.write(`[Ghost] Error: ${String(err)}\n`);
      return { success: false, url: null };
    }
  }
}

export const ghostPublisher = new GhostPublisher();
