import { describe, expect, it } from 'vitest';
import { voiceAccountBadges } from './account-badges';
const now = 10000;
const subscription = (planCode: string, status = 'ACTIVE', startedAt = 0, expiresAt = 20000) => ({
  planCode,
  status,
  startedAt: new Date(startedAt),
  expiresAt: new Date(expiresAt),
});
describe('account-backed room badges', () => {
  it('verifies only account administrators, never ordinary members or room hosts', () => {
    expect(voiceAccountBadges({ role: 'OWNER' })).toEqual(['verified', 'owner']);
    expect(voiceAccountBadges({ role: 'ADMIN' })).toEqual(['verified', 'admin']);
    for (const role of ['USER', 'MODERATOR', 'host', 'speaker', undefined])
      expect(voiceAccountBadges({ role })).toEqual([]);
  });
  it('shows only the highest current subscription, ignoring expired, future and cancelled grants', () => {
    expect(
      voiceAccountBadges({ subscriptions: [subscription('KNIGHT'), subscription('PRINCE')] }, now),
    ).toEqual(['prince']);
    expect(
      voiceAccountBadges(
        {
          subscriptions: [
            subscription('SULTAN', 'CANCELLED'),
            subscription('SULTAN', 'ACTIVE', 11000),
            subscription('PRINCE', 'ACTIVE', 0, now),
            subscription('UNKNOWN'),
            subscription('KNIGHT'),
          ],
        },
        now,
      ),
    ).toEqual(['knight']);
    expect(voiceAccountBadges({ subscriptions: [] }, now)).toEqual([]);
  });
});
