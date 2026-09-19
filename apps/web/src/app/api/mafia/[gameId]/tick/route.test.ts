import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  advanceMafiaGame: vi.fn(),
  findFirst: vi.fn(),
  getCurrentSession: vi.fn(),
  getMafiaAccessToken: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  markMafiaParticipantSeen: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ mafiaGame: { findFirst: mocks.findFirst } }),
  hasDatabaseUrl: mocks.hasDatabaseUrl,
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock('@/lib/mafia/access-cookie', () => ({
  getMafiaAccessToken: mocks.getMafiaAccessToken,
}));

vi.mock('@/lib/mafia/engine', () => ({
  advanceMafiaGame: mocks.advanceMafiaGame,
  markMafiaParticipantSeen: mocks.markMafiaParticipantSeen,
}));

function tickRequest(body: object) {
  return new Request('http://localhost/api/mafia/game-1/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('mafia tick route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.getMafiaAccessToken.mockResolvedValue('');
    mocks.findFirst.mockResolvedValue(null);
  });

  it('يرفض تغيير المرحلة دون مضيف أو لاعب موثّق', async () => {
    const response = await POST(tickRequest({}), {
      params: Promise.resolve({ gameId: 'game-1' }),
    });

    expect(response.status).toBe(401);
    expect(mocks.advanceMafiaGame).not.toHaveBeenCalled();
  });

  it('يسمح للاعب صاحب الكعكة الآمنة بتحديث المرحلة', async () => {
    mocks.getMafiaAccessToken.mockResolvedValue('signed-token');
    mocks.markMafiaParticipantSeen.mockResolvedValue(true);

    const response = await POST(tickRequest({ participantId: 'player-1' }), {
      params: Promise.resolve({ gameId: 'game-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.markMafiaParticipantSeen).toHaveBeenCalledWith(
      'game-1',
      'player-1',
      'signed-token',
    );
    expect(mocks.advanceMafiaGame).toHaveBeenCalledWith('game-1');
  });

  it('يسمح لمضيف الغرفة بتحديث المرحلة', async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: { id: 'host-1' } });
    mocks.findFirst.mockResolvedValue({ id: 'game-1' });

    const response = await POST(tickRequest({}), {
      params: Promise.resolve({ gameId: 'game-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: 'game-1', hostId: 'host-1' },
      select: { id: true },
    });
    expect(mocks.advanceMafiaGame).toHaveBeenCalledWith('game-1');
  });
});
