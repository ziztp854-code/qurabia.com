import { describe, expect, it, vi } from 'vitest';
import { createMobileProfileService } from './service';

describe('mobile profile service', () => {
  it('returns the canonical rank definition and real aggregate counts', async () => {
    const service = createMobileProfileService({
      loadProfile: vi.fn().mockResolvedValue({
        id: 'user-1',
        name: 'سارة',
        email: 'sara@example.com',
        image: null,
        role: 'USER',
        profile: { displayName: 'سارة', bio: 'مضيفة', avatarUrl: null },
        stats: { quizzes: 4, questions: 18, participations: 9, hostedRooms: 3 },
      }),
      resolvePlanCode: vi.fn().mockResolvedValue('KNIGHT'),
    });

    await expect(service.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      displayName: 'سارة',
      rank: { code: 'KNIGHT', name: 'الفارس', emblem: '⚜' },
      stats: { quizzes: 4, questions: 18, participations: 9, hostedRooms: 3 },
    });
  });

  it('does not reveal whether a missing user exists beyond a generic not-found error', async () => {
    const service = createMobileProfileService({
      loadProfile: vi.fn().mockResolvedValue(null),
      resolvePlanCode: vi.fn(),
    });

    await expect(service.getProfile('missing')).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      status: 404,
    });
  });
});
