import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  listHostQuizzes: vi.fn(),
  createRoom: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: () => true }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/mobile-auth/authorization', () => ({
  requireMobileUser: vi.fn(async () => mocks.user),
}));
vi.mock('@/lib/mobile-rooms', () => ({
  MobileRoomsError: class MobileRoomsError extends Error {},
  createDefaultMobileRoomsService: () => ({
    listHostQuizzes: mocks.listHostQuizzes,
    createRoom: mocks.createRoom,
  }),
}));

import { GET, POST } from './route';

describe('/api/mobile/rooms', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.listHostQuizzes.mockReset();
    mocks.createRoom.mockReset();
  });

  it('does not expose a user quiz list without a valid mobile session', async () => {
    const response = await GET(new Request('https://qurabia.com/api/mobile/rooms'));
    expect(response.status).toBe(401);
    expect(mocks.listHostQuizzes).not.toHaveBeenCalled();
  });

  it('passes only the authenticated identity and validated quiz id to room creation', async () => {
    mocks.user = { id: 'user-1', role: 'USER' };
    mocks.createRoom.mockResolvedValue({
      room: { sessionId: 'session-1' },
      ticket: { role: 'host' },
    });
    const response = await POST(
      new Request('https://qurabia.com/api/mobile/rooms', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ quizId: 'quiz-1' }),
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createRoom).toHaveBeenCalledWith({ user: mocks.user, quizId: 'quiz-1' });
  });
});
