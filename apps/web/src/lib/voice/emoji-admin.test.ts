import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emojiAdmin } from './emoji-admin';
const mocks = vi.hoisted(() => ({ session: vi.fn(), rateLimit: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getOptionalAdminConsoleUser: mocks.session }));
vi.mock('./identity', () => ({ voiceRateLimit: mocks.rateLimit }));
beforeEach(() => {
  vi.clearAllMocks();
});
describe('emoji admin authorization', () => {
  it('rejects missing sessions and room moderators without content permission', async () => {
    for (const value of [null, { id: 'mod', role: 'MODERATOR' }, { id: 'user', role: 'USER' }]) {
      mocks.session.mockResolvedValue(value);
      await expect(emojiAdmin()).rejects.toMatchObject({ status: 403 });
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it('uses the existing content permission and server rate limiter for authorized staff', async () => {
    for (const role of ['OWNER', 'ADMIN', 'CONTENT_EDITOR']) {
      mocks.session.mockResolvedValue({ id: 'staff', role });
      await expect(emojiAdmin()).resolves.toMatchObject({ id: 'staff', role });
    }
    expect(mocks.rateLimit).toHaveBeenLastCalledWith('staff', true, 'emoji-admin');
  });
});
