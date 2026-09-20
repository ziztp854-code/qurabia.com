import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readRoom: vi.fn() }));

vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: () => true }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/mobile-rooms', () => ({
  MobileRoomsError: class MobileRoomsError extends Error {},
  createDefaultMobileRoomsService: () => ({ readRoom: mocks.readRoom }),
}));

import { GET } from './route';

describe('GET /api/mobile/rooms/[roomCode]', () => {
  beforeEach(() => mocks.readRoom.mockReset());

  it('returns only the public lobby snapshot required before joining', async () => {
    mocks.readRoom.mockResolvedValue({
      sessionId: 'session-1',
      roomCode: 'ABC234',
      status: 'WAITING',
      title: 'مسابقة',
      maxPlayers: 10,
      participants: [{ id: 'player-1', displayName: 'مها', score: 0, status: 'CONNECTED' }],
    });
    const response = await GET(new Request('https://qurabia.com/api/mobile/rooms/ABC234'), {
      params: Promise.resolve({ roomCode: 'ABC234' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.readRoom).toHaveBeenCalledWith('ABC234');
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { roomCode: 'ABC234', participants: [{ displayName: 'مها' }] },
    });
  });
});
