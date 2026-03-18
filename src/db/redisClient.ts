import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      enableOfflineQueue: true,
    });
    _redis.on('error', (err: Error) => {
      process.stderr.write(`[Redis] Error: ${err.message}\n`);
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
