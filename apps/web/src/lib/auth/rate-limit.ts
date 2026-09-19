import { createHmac } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const limiters = new Map<string, Ratelimit>();
let redis: Redis | undefined;

export function getSharedRedis() {
  const upstashCredentials =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? {
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        }
      : null;
  const kvCredentials =
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
      ? { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN }
      : null;
  const credentials = upstashCredentials || kvCredentials;
  if (!credentials) return null;

  redis ??= new Redis(credentials);
  return redis;
}

function getLimiter(limit: number, windowMs: number) {
  const redisClient = getSharedRedis();
  if (!redisClient) return null;

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const cacheKey = `${limit}:${windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `tahaddi:ratelimit:${cacheKey}`,
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }

  return limiter;
}

export function hashRateLimitKey(scope: string, identifiers: string[]) {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      'RATE_LIMIT_HMAC_SECRET is required when distributed rate limiting is enabled.',
    );
  }

  return createHmac('sha256', secret).update(JSON.stringify({ scope, identifiers })).digest('hex');
}

function parseLegacyRateLimitKey(key: string) {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex === -1) {
    return { scope: 'default', identifiers: [key] };
  }

  return {
    scope: key.slice(0, separatorIndex),
    identifiers: [key.slice(separatorIndex + 1)],
  };
}

export async function checkRateLimit(key: string, limit = 8, windowMs = 15 * 60 * 1000) {
  const limiter = getLimiter(limit, windowMs);
  if (!limiter) {
    const isLocalAuthE2E =
      process.env.RUN_AUTH_E2E === 'true' &&
      ['http://127.0.0.1:3000', 'http://localhost:3000'].includes(process.env.NEXTAUTH_URL ?? '');
    return process.env.NODE_ENV !== 'production' || isLocalAuthE2E;
  }

  const { scope, identifiers } = parseLegacyRateLimitKey(key);
  return (await limiter.limit(hashRateLimitKey(scope, identifiers))).success;
}

export function resetRateLimitsForTests() {
  limiters.clear();
  redis = undefined;
}
