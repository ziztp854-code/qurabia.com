import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateVoicePreferences } from './repository';

const mocks = vi.hoisted(() => ({
  preference: { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  transactionalPreference: { updateMany: vi.fn() },
  profile: { updateMany: vi.fn() },
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    voicePreference: mocks.preference,
    profile: mocks.profile,
    $transaction: mocks.transaction,
  }),
}));
vi.mock('./community-identity', () => ({
  voiceCommunityIdentities: vi.fn(),
  syncVoiceCommunityIdentity: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preference.findUniqueOrThrow.mockResolvedValue({
    revision: 3,
    state: { privateProfile: true },
  });
  mocks.preference.updateMany.mockResolvedValue({ count: 1 });
  mocks.transactionalPreference.updateMany.mockResolvedValue({ count: 1 });
  mocks.profile.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({ voicePreference: mocks.transactionalPreference, profile: mocks.profile }),
  );
});

describe('legacy voice privacy and community profile visibility', () => {
  it('makes an explicitly public profile truthful across both stores in one transaction', async () => {
    const result = await updateVoicePreferences('self', { type: 'privacy', privateProfile: false });
    expect(result.privateProfile).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.preference.updateMany).not.toHaveBeenCalled();
    expect(mocks.transactionalPreference.updateMany).toHaveBeenCalledWith({
      where: { userId: 'self', revision: 3 },
      data: {
        state: expect.objectContaining({ privateProfile: false }),
        revision: { increment: 1 },
      },
    });
    expect(mocks.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'self', visibility: { in: ['PRIVATE', 'MEMBERS'] } },
      data: { visibility: 'PUBLIC' },
    });
  });
  it('preserves granular visibility when privacy is omitted or explicitly made private', async () => {
    await updateVoicePreferences('self', { type: 'privacy', notifyFavorites: false });
    await updateVoicePreferences('self', { type: 'privacy', privateProfile: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.profile.updateMany).not.toHaveBeenCalled();
    expect(mocks.preference.updateMany).toHaveBeenCalledTimes(2);
  });
  it('does not clear profile restrictions until the preference revision update succeeds', async () => {
    mocks.transactionalPreference.updateMany.mockResolvedValueOnce({ count: 0 });
    await updateVoicePreferences('self', { type: 'privacy', privateProfile: false });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.profile.updateMany).toHaveBeenCalledOnce();
  });
  it('does not report success if the atomic profile synchronization fails', async () => {
    mocks.profile.updateMany.mockRejectedValue(new Error('profile unavailable'));
    await expect(
      updateVoicePreferences('self', { type: 'privacy', privateProfile: false }),
    ).rejects.toThrow('profile unavailable');
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
