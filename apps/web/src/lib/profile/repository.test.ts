import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  preferences: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  findUniqueOrThrow: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    user: { count: mocks.count, findUniqueOrThrow: mocks.findUniqueOrThrow },
    $transaction: mocks.transaction,
  }),
}));
vi.mock('@/lib/voice/repository', () => ({ getVoicePreferences: mocks.preferences }));
import { profileSocialCounts, saveProfileIdentity } from './repository';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences.mockResolvedValue({ following: ['friend'], blockedUsers: ['blocked'] });
  mocks.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.upsert.mockResolvedValue({});
  mocks.transaction.mockImplementation((fn) =>
    fn({ user: { updateMany: mocks.updateMany }, profile: { upsert: mocks.upsert } }),
  );
  mocks.findUniqueOrThrow.mockResolvedValue({
    image: null,
    profile: { displayName: 'اسم جديد', username: 'new_name', bio: '', avatarUrl: null },
  });
});
describe('profile persistence and social counts', () => {
  it('uses actual incoming/outgoing follows with inactive and two-way block filtering', async () => {
    expect(await profileSocialCounts('self')).toEqual({ followers: 12, following: 3 });
    const incoming = mocks.count.mock.calls[0][0].where,
      outgoing = mocks.count.mock.calls[1][0].where;
    expect(incoming).toMatchObject({
      status: 'ACTIVE',
      id: { notIn: ['self', 'blocked'] },
      voicePreference: { is: { state: { path: ['following'], array_contains: ['self'] } } },
      NOT: {
        voicePreference: { is: { state: { path: ['blockedUsers'], array_contains: ['self'] } } },
      },
    });
    expect(outgoing.id).toEqual({ notIn: ['self', 'blocked'], in: ['friend'] });
  });
  it('writes identity and photo deletion in the same transaction without changing privileges', async () => {
    await saveProfileIdentity(
      'self',
      { displayName: 'اسم جديد', username: 'new_name', bio: '' },
      null,
    );
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'self', status: 'ACTIVE' },
      data: { name: 'اسم جديد', image: null },
    });
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({
      avatarUrl: null,
      avatarContent: null,
    });
    expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty('role');
  });
  it('rejects an account suspended before the write and maps database unique conflicts', async () => {
    const fields = { displayName: 'اسم', username: 'unique', bio: '' };
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveProfileIdentity('self', fields)).rejects.toMatchObject({ status: 401 });
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.transaction.mockRejectedValue({ code: 'P2002' });
    await expect(saveProfileIdentity('self', fields)).rejects.toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
    });
  });
});
