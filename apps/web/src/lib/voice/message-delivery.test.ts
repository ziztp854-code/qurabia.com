import { beforeEach, expect, it, vi } from 'vitest';
import { voiceMessageDelivery } from './message-delivery';
const mocks = vi.hoisted(() => ({ room: vi.fn(), accounts: vi.fn() }));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    voiceRoom: { findUnique: mocks.room },
    user: { findMany: mocks.accounts },
  }),
}));
const message = {
  id: 'msg',
  userId: 'sender',
  name: 'عضو',
  image: null,
  text: 'أهلًا',
  createdAt: 1,
  replyTo: null,
  pinned: false,
  reactions: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.room.mockResolvedValue({
    active: true,
    revision: 12,
    state: {
      active: true,
      settings: {},
      bannedUsers: ['banned'],
      participants: ['allowed', 'blocked', 'revoked', 'banned'].map((id) => ({
        id,
        tokenVersion: 0,
        lastSeenAt: Date.now(),
      })),
      messages: [message],
    },
  });
  mocks.accounts.mockResolvedValue([
    { id: 'allowed', tokenVersion: 0, voicePreference: null },
    { id: 'blocked', tokenVersion: 0, voicePreference: { state: { blockedUsers: ['sender'] } } },
    { id: 'revoked', tokenVersion: 1, voicePreference: null },
  ]);
});
it('targets only current active membership with matching sessions and unblocked chat', async () => {
  const delivery = await voiceMessageDelivery('room', 'msg');
  expect(delivery).toMatchObject({ message, recipients: ['allowed'], cursor: 12 });
  expect(mocks.accounts).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: { in: ['allowed', 'blocked', 'revoked'] }, status: 'ACTIVE' },
    }),
  );
});
it('never delivers deleted messages or closed room history', async () => {
  expect(await voiceMessageDelivery('room', 'deleted')).toBeNull();
  expect(mocks.accounts).not.toHaveBeenCalled();
  mocks.room.mockResolvedValue({ active: false });
  expect(await voiceMessageDelivery('room', 'msg')).toBeNull();
});
