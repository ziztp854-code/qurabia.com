import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), rate: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(),
}));
vi.mock('@/lib/voice/identity', () => ({ voiceActor: mocks.actor, voiceRateLimit: mocks.rate }));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ gameFavorite: { findMany: mocks.findMany, upsert: mocks.upsert, deleteMany: mocks.deleteMany } }),
}));
import { GET, PUT } from './route';
import { VoiceHttpError } from '@/lib/voice/http';

function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/game-favorites', {
    method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('game favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: 'user-1' });
    mocks.rate.mockResolvedValue(undefined);
    mocks.findMany.mockResolvedValue([{ gameId: 'chess' }]);
  });
  it('requires an active account for reading and writing', async () => {
    mocks.actor.mockRejectedValue(new VoiceHttpError(401, 'سجّل الدخول'));
    expect((await GET()).status).toBe(401);
    expect((await PUT(request({ gameId: 'chess', favorite: true }))).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('reads only the current account favorites', async () => {
    const result = await GET();
    expect(await result.json()).toEqual({ gameIds: ['chess'] });
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' }, select: { gameId: true } });
  });
  it('writes idempotently for the current account', async () => {
    const result = await PUT(request({ gameId: 'chess', favorite: true }));
    expect(result.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_gameId: { userId: 'user-1', gameId: 'chess' } },
      create: { userId: 'user-1', gameId: 'chess' },
    }));
  });
  it('rejects another origin and unpublished games', async () => {
    expect((await PUT(request({ gameId: 'chess', favorite: true }, 'https://example.org'))).status).toBe(403);
    expect((await PUT(request({ gameId: 'spectrum', favorite: true }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('removes only the current account entry', async () => {
    expect((await PUT(request({ gameId: 'chess', favorite: false }))).status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', gameId: 'chess' } });
  });
});
