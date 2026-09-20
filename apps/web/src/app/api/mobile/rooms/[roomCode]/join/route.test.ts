import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  joinRoom: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: () => true }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/mobile-auth/authorization', () => ({
  getOptionalMobileUser: vi.fn(async () => mocks.user),
}));
vi.mock('@/lib/mobile-rooms', () => ({
  MobileRoomsError: class MobileRoomsError extends Error {},
  createDefaultMobileRoomsService: () => ({ joinRoom: mocks.joinRoom }),
}));

import { POST } from './route';

describe('/api/mobile/rooms/[roomCode]/join', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.joinRoom.mockReset();
  });

  it('allows an explicit guest join without inventing a user identity', async () => {
    mocks.joinRoom.mockResolvedValue({ room: {}, ticket: { role: 'player' } });
    const response = await POST(
      new Request('https://qurabia.com/api/mobile/rooms/ABC234/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'لاعب' }),
      }),
      { params: Promise.resolve({ roomCode: 'ABC234' }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.joinRoom).toHaveBeenCalledWith({
      roomCode: 'ABC234',
      displayName: 'لاعب',
      userId: undefined,
    });
  });

  it('rejects a supplied invalid bearer token instead of silently downgrading it to guest', async () => {
    const response = await POST(
      new Request('https://qurabia.com/api/mobile/rooms/ABC234/join', {
        method: 'POST',
        headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'لاعب' }),
      }),
      { params: Promise.resolve({ roomCode: 'ABC234' }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });

  it('binds an authenticated join to the verified mobile user', async () => {
    mocks.user = { id: 'user-1' };
    mocks.joinRoom.mockResolvedValue({ room: {}, ticket: { role: 'player' } });
    const response = await POST(
      new Request('https://qurabia.com/api/mobile/rooms/ABC234/join', {
        method: 'POST',
        headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'مها' }),
      }),
      { params: Promise.resolve({ roomCode: 'ABC234' }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.joinRoom).toHaveBeenCalledWith({
      roomCode: 'ABC234',
      displayName: 'مها',
      userId: 'user-1',
    });
  });
});
