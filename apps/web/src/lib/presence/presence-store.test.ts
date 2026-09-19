import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRESENCE_TTL_MS,
  isVisitorId,
  recordPresenceHeartbeat,
  readPresenceCounts,
  resetPresenceMemoryForTests,
} from './presence-store';

vi.mock('@/lib/auth/rate-limit', () => ({
  getSharedRedis: () => null,
}));

describe('presence store', () => {
  afterEach(() => {
    resetPresenceMemoryForTests();
  });

  it('accepts anonymous visitor ids and rejects other values', () => {
    expect(isVisitorId('8f14e45f-ea44-4a2d-9c1a-0b3c2d1e0f9a')).toBe(true);
    expect(isVisitorId('not a visitor')).toBe(false);
    expect(isVisitorId(12)).toBe(false);
  });

  it('counts a visitor as present and unique without inventing extra numbers', async () => {
    const now = Date.parse('2026-08-17T12:00:00.000Z');
    await recordPresenceHeartbeat('8f14e45f-ea44-4a2d-9c1a-0b3c2d1e0f9a', now);
    await recordPresenceHeartbeat('8f14e45f-ea44-4a2d-9c1a-0b3c2d1e0f9a', now + 1_000);

    await expect(readPresenceCounts(now + 2_000)).resolves.toEqual({
      presentNow: 1,
      uniqueToday: 1,
      viewsToday: 1,
    });
  });

  it('drops presence after the heartbeat window', async () => {
    const now = Date.parse('2026-08-17T12:00:00.000Z');
    await recordPresenceHeartbeat('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', now);

    await expect(readPresenceCounts(now + PRESENCE_TTL_MS + 1)).resolves.toMatchObject({
      presentNow: 0,
      uniqueToday: 1,
    });
  });
});
