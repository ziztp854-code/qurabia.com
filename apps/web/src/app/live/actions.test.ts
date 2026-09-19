import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPlayerLiveAccessToken: vi.fn(),
  getPrismaClient: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  revalidatePath: vi.fn(),
  setMafiaAccessToken: vi.fn(),
  requireActiveUser: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: mocks.getPrismaClient,
  hasDatabaseUrl: mocks.hasDatabaseUrl,
}));
vi.mock('@/lib/auth/session', () => ({
  requireActiveUser: mocks.requireActiveUser,
}));
vi.mock('@/lib/live/access-token', () => ({
  createPlayerLiveAccessToken: mocks.createPlayerLiveAccessToken,
}));
vi.mock('@/lib/mafia/access-cookie', () => ({
  setMafiaAccessToken: mocks.setMafiaAccessToken,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: vi.fn(),
}));

import { joinLiveSessionByCode, startLiveSession } from './actions';

describe('joinLiveSessionByCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.createPlayerLiveAccessToken.mockReturnValue('signed-player-token');
  });

  it('يعيد بيانات الغرفة عند الانضمام برمز صحيح', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'session-1',
      roomCode: 'A7K9PQ',
      quiz: { maxPlayers: 20 },
      _count: { participants: 1 },
    });
    const createParticipant = vi.fn().mockResolvedValue({ id: 'participant-1' });
    mocks.getPrismaClient.mockReturnValue({
      liveSession: { findFirst },
      liveParticipant: { create: createParticipant },
    });

    await expect(joinLiveSessionByCode(' a7k9pq ', ' نورة ')).resolves.toEqual({
      status: 'success',
      gameType: 'quiz',
      sessionId: 'session-1',
      participantId: 'participant-1',
      participantToken: 'signed-player-token',
      roomCode: 'A7K9PQ',
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomCode: 'A7K9PQ', status: { in: ['WAITING', 'ACTIVE'] } },
      }),
    );
    expect(createParticipant).toHaveBeenCalledWith({
      data: { sessionId: 'session-1', displayName: 'نورة' },
      select: { id: true },
    });
  });
});

describe('startLiveSession', () => {
  function mockStartSessionPrisma(
    updateQuota: ReturnType<typeof vi.fn>,
    transaction: ReturnType<typeof vi.fn>,
  ) {
    mocks.getPrismaClient.mockReturnValue({
      quiz: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'quiz-1',
          roomCode: 'AB12CD',
          gameMode: 'QUIZ',
          maxPlayers: 10,
          _count: { questions: 3 },
        }),
      },
      quizQuestion: { count: vi.fn().mockResolvedValue(0) },
      liveSession: { findFirst: vi.fn().mockResolvedValue(null) },
      userSubscription: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      usageCounter: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: updateQuota,
        findUnique: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: transaction,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.requireActiveUser.mockResolvedValue({ id: 'host-1', role: 'USER' });
  });

  it('يرفض تشغيل مسابقة تحتوي أسئلة بلا خيارات', async () => {
    mocks.getPrismaClient.mockReturnValue({
      quiz: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'quiz-1',
          roomCode: 'AB12CD',
          gameMode: 'QUIZ',
          maxPlayers: 20,
          _count: { questions: 3 },
        }),
      },
      quizQuestion: { count: vi.fn().mockResolvedValue(2) },
    });

    await expect(startLiveSession(new FormData())).rejects.toThrow(
      'NEXT_REDIRECT:/host?liveError=quizOptions&count=2',
    );
  });

  it('يسترجع حصة الغرفة إذا فشل إنشاء الجلسة', async () => {
    const updateQuota = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('refund failed'));
    mockStartSessionPrisma(
      updateQuota,
      vi.fn().mockRejectedValue(new Error('transaction failed')),
    );

    const formData = new FormData();
    formData.set('quizId', 'quiz-1');

    await expect(startLiveSession(formData)).rejects.toThrow('transaction failed');
    expect(updateQuota).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { count: { decrement: 1 } } }),
    );
  });

  it('يكشف فشل استرجاع الحصة إذا سبقه طلب متزامن بإنشاء الجلسة', async () => {
    const updateQuota = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('refund failed'));
    const transactionClient = {
      quiz: { update: vi.fn().mockResolvedValue({}) },
      liveSession: {
        findFirst: vi.fn().mockResolvedValue({ id: 'session-existing' }),
        create: vi.fn(),
      },
    };
    mockStartSessionPrisma(
      updateQuota,
      vi.fn().mockImplementation(
        async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    );

    const formData = new FormData();
    formData.set('quizId', 'quiz-1');

    await expect(startLiveSession(formData)).rejects.toThrow('refund failed');
    expect(updateQuota).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { count: { decrement: 1 } } }),
    );
  });
});
