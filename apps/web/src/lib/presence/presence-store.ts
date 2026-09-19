import { createHash } from 'node:crypto';
import { getSharedRedis } from '@/lib/auth/rate-limit';

export const PRESENCE_TTL_MS = 90_000;
const SESSION_VIEW_MS = 30 * 60 * 1000;

type MemoryState = {
  online: Map<string, number>;
  unique: Map<string, Set<string>>;
  views: Map<string, number>;
  lastView: Map<string, number>;
};

const memory: MemoryState = {
  online: new Map(),
  unique: new Map(),
  views: new Map(),
  lastView: new Map(),
};

export function calendarDayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
}

export function hashVisitorId(visitorId: string) {
  return createHash('sha256').update(visitorId.trim()).digest('hex').slice(0, 32);
}

export function isVisitorId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{8,64}$/i.test(value.trim());
}

function pruneMemory(now: number) {
  for (const [id, expires] of memory.online) {
    if (expires <= now) memory.online.delete(id);
  }
}

export async function recordPresenceHeartbeat(visitorId: string, now = Date.now()) {
  const id = hashVisitorId(visitorId);
  const day = calendarDayKey(new Date(now));
  const redis = getSharedRedis();

  if (redis) {
    const onlineKey = 'tahaddi:presence:online';
    const uniqueKey = `tahaddi:presence:unique:${day}`;
    const viewsKey = `tahaddi:presence:views:${day}`;
    const sessionKey = `tahaddi:presence:session:${id}`;
    await redis.zadd(onlineKey, { score: now + PRESENCE_TTL_MS, member: id });
    await redis.zremrangebyscore(onlineKey, 0, now);
    await redis.pfadd(uniqueKey, id);
    const seen = await redis.get<number>(sessionKey);
    if (!seen) {
      await redis.incr(viewsKey);
      await redis.set(sessionKey, now, { px: SESSION_VIEW_MS });
    }
    return;
  }

  pruneMemory(now);
  memory.online.set(id, now + PRESENCE_TTL_MS);
  const unique = memory.unique.get(day) ?? new Set<string>();
  unique.add(id);
  memory.unique.set(day, unique);
  const last = memory.lastView.get(id) ?? 0;
  if (now - last > SESSION_VIEW_MS) {
    memory.views.set(day, (memory.views.get(day) ?? 0) + 1);
    memory.lastView.set(id, now);
  }
}

/**
 * uniqueToday: معرّفات زوار مجهّلة وفريدة خلال اليوم بالتوقيت العالمي.
 * viewsToday: زيارة جديدة للمعرّف نفسه بعد انقطاع ثلاثين دقيقة على الأقل.
 */
export async function readPresenceCounts(now = Date.now()) {
  const day = calendarDayKey(new Date(now));
  const redis = getSharedRedis();

  if (redis) {
    const onlineKey = 'tahaddi:presence:online';
    await redis.zremrangebyscore(onlineKey, 0, now);
    const [presentNow, uniqueToday, viewsToday] = await Promise.all([
      redis.zcard(onlineKey),
      redis.pfcount(`tahaddi:presence:unique:${day}`),
      redis.get<number>(`tahaddi:presence:views:${day}`),
    ]);
    return {
      presentNow: Number(presentNow) || 0,
      uniqueToday: Number(uniqueToday) || 0,
      viewsToday: Number(viewsToday) || 0,
    };
  }

  pruneMemory(now);
  return {
    presentNow: memory.online.size,
    uniqueToday: memory.unique.get(day)?.size ?? 0,
    viewsToday: memory.views.get(day) ?? 0,
  };
}

export function resetPresenceMemoryForTests() {
  memory.online.clear();
  memory.unique.clear();
  memory.views.clear();
  memory.lastView.clear();
}
