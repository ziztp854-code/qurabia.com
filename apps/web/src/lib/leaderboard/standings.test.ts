import { describe, expect, it, vi } from 'vitest';
import { getLeaderboardPayload } from './standings';

describe('getLeaderboardPayload', () => {
  it('يجمع الفائزين فقط من الجولات المنتهية ويرتبهم حسب الرصيد', async () => {
    const prisma = {
      liveSession: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'session-1',
            endedAt: new Date('2026-08-12T10:00:00.000Z'),
            createdAt: new Date('2026-08-12T09:00:00.000Z'),
            participants: [
              {
                id: 'player-1',
                displayName: 'أميرة',
                score: 2450,
                correctCount: 18,
                joinedAt: new Date('2026-08-12T09:01:00.000Z'),
              },
              {
                id: 'player-2',
                displayName: 'محمد',
                score: 2100,
                correctCount: 16,
                joinedAt: new Date('2026-08-12T09:02:00.000Z'),
              },
            ],
          },
          {
            id: 'session-2',
            endedAt: new Date('2026-08-11T10:00:00.000Z'),
            createdAt: new Date('2026-08-11T09:00:00.000Z'),
            participants: [
              {
                id: 'player-3',
                displayName: 'أميرة ',
                score: 1800,
                correctCount: 12,
                joinedAt: new Date('2026-08-11T09:01:00.000Z'),
              },
              {
                id: 'player-4',
                displayName: 'سارة',
                score: 1800,
                correctCount: 11,
                joinedAt: new Date('2026-08-11T09:02:00.000Z'),
              },
            ],
          },
        ]),
      },
    };

    const payload = await getLeaderboardPayload(prisma, { sessionLimit: 10, playerLimit: 10 });

    expect(prisma.liveSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'FINISHED' } }),
    );
    expect(payload.finishedSessions).toBe(2);
    expect(payload.players).toEqual([
      {
        id: 'player-1',
        name: 'أميرة',
        score: 4250,
        rank: 1,
        streak: 2,
        correctAnswers: 30,
      },
      {
        id: 'player-4',
        name: 'سارة',
        score: 1800,
        rank: 2,
        streak: 1,
        correctAnswers: 11,
      },
    ]);
  });
});
