import { beforeEach, describe, expect, it, vi } from 'vitest';
import { voiceRelationship } from './social-policy';
import { sendVoiceDirectMessage, voiceConversation } from './social';
import type { VoicePreferences } from './types';
const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  read: vi.fn(),
  preferences: new Map(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    user: { findFirst: mocks.users },
    voiceDirectMessage: { create: mocks.create, findMany: mocks.find, updateMany: mocks.read },
  }),
}));
vi.mock('./repository', () => ({
  getVoicePreferences: async (id: string) => mocks.preferences.get(id),
}));
const preferences = (extra: Partial<VoicePreferences> = {}): VoicePreferences => ({
  favorites: [],
  following: [],
  history: [],
  blockedUsers: [],
  mutedUsers: [],
  privateProfile: false,
  notifyFavorites: true,
  ...extra,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences.set('a', preferences({ following: ['b'] }));
  mocks.preferences.set('b', preferences({ following: ['a'] }));
  mocks.users.mockResolvedValue({ id: 'b', name: 'صديق', image: null, profile: null });
  mocks.find.mockResolvedValue([]);
});
describe('private voice conversations', () => {
  it('requires mutual following for friendship and default messaging', () => {
    expect(
      voiceRelationship('a', 'b', preferences({ following: ['b'] }), preferences()).friend,
    ).toBe(false);
    expect(
      voiceRelationship('a', 'b', preferences({ following: ['b'] }), preferences()).canMessage,
    ).toBe(false);
    expect(
      voiceRelationship(
        'a',
        'b',
        preferences({ following: ['b'] }),
        preferences({ following: ['a'] }),
      ).friend,
    ).toBe(true);
  });
  it('allows explicit everyone policy, honors none, and blocks both directions', () => {
    expect(
      voiceRelationship('a', 'b', preferences(), preferences({ directMessages: 'everyone' }))
        .canMessage,
    ).toBe(true);
    for (const peer of [
      preferences({ directMessages: 'none', following: ['a'] }),
      preferences({ directMessages: 'everyone', blockedUsers: ['a'] }),
    ])
      expect(voiceRelationship('a', 'b', preferences({ following: ['b'] }), peer).canMessage).toBe(
        false,
      );
    expect(
      voiceRelationship(
        'a',
        'b',
        preferences({ blockedUsers: ['b'] }),
        preferences({ directMessages: 'everyone' }),
      ).canMessage,
    ).toBe(false);
  });
  it('uses the authenticated sender, checks permission before storing, and scopes history to exactly two members', async () => {
    await sendVoiceDirectMessage('a', 'b', 'مرحبًا');
    expect(mocks.create).toHaveBeenCalledWith({
      data: { senderId: 'a', recipientId: 'b', text: 'مرحبًا' },
    });
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { senderId: 'a', recipientId: 'b' },
            { senderId: 'b', recipientId: 'a' },
          ],
        },
        take: 80,
      }),
    );
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientId: 'a', readAt: null }),
      }),
    );
  });
  it('rejects unavailable, self, blocked and privacy-denied conversations without storing', async () => {
    await expect(voiceConversation('a', 'a')).rejects.toMatchObject({ status: 400 });
    mocks.preferences.set('b', preferences({ directMessages: 'none' }));
    await expect(sendVoiceDirectMessage('a', 'b', 'رسالة')).rejects.toMatchObject({ status: 403 });
    mocks.preferences.set('b', preferences({ blockedUsers: ['a'] }));
    await expect(voiceConversation('a', 'b')).rejects.toMatchObject({ status: 403 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    mocks.users.mockResolvedValue(null);
    await expect(voiceConversation('a', 'b')).rejects.toMatchObject({ status: 404 });
  });
});
