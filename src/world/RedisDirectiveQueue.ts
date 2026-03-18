import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/pgClient';
import { getRedis } from '../db/redisClient';
import type { Directive } from '../types';

export async function enqueue(
  soulId: string,
  message: string,
  visitorId = 'visitor',
): Promise<Directive> {
  const directive: Directive = {
    id:         uuidv4(),
    soul_id:    soulId,
    visitor_id: visitorId,
    message,
    injected:   false,
    ts:         Date.now(),
  };

  await getPool().query(
    `INSERT INTO directives (id, soul_id, visitor_id, message, injected, ts)
     VALUES ($1, $2, $3, $4, FALSE, $5)`,
    [directive.id, soulId, visitorId, message, directive.ts],
  );

  const redis = getRedis();
  await redis.rpush(`directives:${soulId}`, JSON.stringify(directive));
  await redis.expire(`directives:${soulId}`, 86400); // 24h safety TTL

  return directive;
}

// Atomically drain all pending directives for a soul from Redis, mark injected in DB.
export async function drain(soulId: string): Promise<Directive[]> {
  const redis = getRedis();
  const items = await redis.lrange(`directives:${soulId}`, 0, -1);
  if (items.length === 0) return [];

  await redis.del(`directives:${soulId}`);

  const directives = items.map(s => JSON.parse(s) as Directive);
  const ids = directives.map(d => d.id);

  await getPool().query(
    `UPDATE directives SET injected = TRUE WHERE id = ANY($1::text[])`,
    [ids],
  );

  return directives;
}

export async function getRecent(limit = 5): Promise<Directive[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM directives ORDER BY ts DESC LIMIT $1',
    [limit],
  );
  return rows as Directive[];
}
