import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceMafiaGame } from './engine';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    mafiaGame: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    mafiaMessage: {
      create: vi.fn(),
    },
    mafiaParticipant: { update: vi.fn() },
    mafiaAction: { findMany: vi.fn() },
    mafiaVote: { groupBy: vi.fn() },
  },
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => prisma,
}));

describe('advanceMafiaGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof prisma) => unknown) =>
      callback(prisma),
    );
    prisma.mafiaGame.updateMany.mockResolvedValue({ count: 1 });
    prisma.mafiaAction.findMany.mockResolvedValue([]);
    prisma.mafiaVote.groupBy.mockResolvedValue([]);
  });

  const players = [
    { id: 'killer', displayName: 'سالم', role: 'KILLER' },
    { id: 'doctor', displayName: 'ناصر', role: 'DOCTOR' },
    { id: 'citizen', displayName: 'خالد', role: 'CITIZEN' },
    { id: 'detective', displayName: 'فهد', role: 'DETECTIVE' },
  ];
  function preparePhase(status: 'NIGHT' | 'VOTING', participants = players) {
    prisma.mafiaGame.findUnique
      .mockResolvedValueOnce({
        status,
        autoMode: true,
        phaseEndsAt: new Date('2026-07-25T11:59:59.000Z'),
      })
      .mockResolvedValueOnce({
        status,
        currentRound: 2,
        daySeconds: 90,
        nightSeconds: 45,
        participants,
      });
  }

  it('does not eliminate a protected night target', async () => {
    preparePhase('NIGHT');
    prisma.mafiaAction.findMany.mockResolvedValue([
      { type: 'KILL', targetId: 'citizen', actorId: 'killer' },
      { type: 'HEAL', targetId: 'citizen', actorId: 'doctor' },
    ]);
    await advanceMafiaGame('game-1');
    expect(prisma.mafiaParticipant.update).not.toHaveBeenCalled();
    expect(prisma.mafiaGame.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DAY', phaseEndsAt: expect.any(Date) } }),
    );
  });

  it('finishes the game when a night elimination gives the killers parity', async () => {
    preparePhase('NIGHT', players.slice(0, 3));
    prisma.mafiaAction.findMany.mockResolvedValue([
      { type: 'KILL', targetId: 'citizen', actorId: 'killer' },
    ]);
    await advanceMafiaGame('game-1');
    expect(prisma.mafiaParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'citizen' },
        data: expect.objectContaining({ status: 'ELIMINATED' }),
      }),
    );
    expect(prisma.mafiaGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FINISHED', winner: 'KILLERS', phaseEndsAt: null }),
      }),
    );
  });

  it('finishes with a citizen victory when the last killer is voted out', async () => {
    preparePhase('VOTING');
    prisma.mafiaVote.groupBy.mockResolvedValue([{ targetId: 'killer', _count: { targetId: 3 } }]);
    await advanceMafiaGame('game-1');
    expect(prisma.mafiaGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FINISHED',
          winner: 'CITIZENS',
          phaseEndsAt: null,
        }),
      }),
    );
  });

  it('does not eliminate anyone when the top votes are tied', async () => {
    preparePhase('VOTING');
    prisma.mafiaVote.groupBy.mockResolvedValue([
      { targetId: 'killer', _count: { targetId: 2 } },
      { targetId: 'citizen', _count: { targetId: 2 } },
    ]);
    await advanceMafiaGame('game-1');
    expect(prisma.mafiaParticipant.update).not.toHaveBeenCalled();
    expect(prisma.mafiaGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'NIGHT', currentRound: { increment: 1 }, phaseEndsAt: expect.any(Date) },
      }),
    );
  });

  it('distinguishes an empty voting round from a tie', async () => {
    preparePhase('VOTING');
    await advanceMafiaGame('game-1');
    expect(prisma.mafiaMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: expect.stringContaining('لم تُسجّل أصوات') }),
      }),
    );
    expect(prisma.mafiaParticipant.update).not.toHaveBeenCalled();
  });

  it('does not let a stale manual transition resolve a later round of the same phase', async () => {
    prisma.mafiaGame.findUnique.mockResolvedValueOnce({
      status: 'NIGHT',
      autoMode: false,
      phaseEndsAt: new Date('2026-07-25T12:05:00.000Z'),
    });
    prisma.mafiaGame.updateMany.mockResolvedValueOnce({ count: 0 });
    await advanceMafiaGame('game-1', true);
    expect(prisma.mafiaAction.findMany).not.toHaveBeenCalled();
    expect(prisma.mafiaGame.update).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims and completes an expired automatic transition in one transaction', async () => {
    const expiredDeadline = new Date('2026-07-25T11:59:59.000Z');
    prisma.mafiaGame.findUnique
      .mockResolvedValueOnce({
        status: 'DAY',
        autoMode: true,
        phaseEndsAt: expiredDeadline,
      })
      .mockResolvedValueOnce({
        status: 'DAY',
        votingSeconds: 30,
      });
    prisma.mafiaGame.updateMany.mockResolvedValue({ count: 1 });
    prisma.mafiaGame.update.mockResolvedValue({});
    prisma.mafiaMessage.create.mockResolvedValue({});

    await advanceMafiaGame('game-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.mafiaGame.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'game-1',
        status: 'DAY',
        phaseEndsAt: expiredDeadline,
      },
      data: {
        phaseEndsAt: expiredDeadline,
      },
    });
    expect(prisma.mafiaGame.update).toHaveBeenCalledTimes(1);
    expect(prisma.mafiaMessage.create).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale lease holder complete a duplicate transition', async () => {
    const expiredDeadline = new Date('2026-07-25T11:59:59.000Z');
    prisma.mafiaGame.findUnique.mockResolvedValueOnce({
      status: 'DAY',
      autoMode: true,
      phaseEndsAt: expiredDeadline,
    });
    prisma.mafiaGame.updateMany.mockResolvedValueOnce({ count: 0 });

    await advanceMafiaGame('game-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.mafiaGame.update).not.toHaveBeenCalled();
    expect(prisma.mafiaMessage.create).not.toHaveBeenCalled();
  });

  it('forces a host-controlled transition before expiry while matching the observed phase', async () => {
    const futureDeadline = new Date('2026-07-25T12:05:00.000Z');
    prisma.mafiaGame.findUnique
      .mockResolvedValueOnce({
        status: 'DAY',
        autoMode: false,
        phaseEndsAt: futureDeadline,
      })
      .mockResolvedValueOnce({
        status: 'DAY',
        votingSeconds: 30,
      });
    prisma.mafiaGame.updateMany.mockResolvedValue({ count: 1 });
    prisma.mafiaGame.update.mockResolvedValue({});
    prisma.mafiaMessage.create.mockResolvedValue({});

    await advanceMafiaGame('game-1', true);

    expect(prisma.mafiaGame.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'game-1',
        status: 'DAY',
        phaseEndsAt: futureDeadline,
      },
      data: {
        phaseEndsAt: futureDeadline,
      },
    });
    expect(prisma.mafiaGame.update).toHaveBeenCalledTimes(1);
    expect(prisma.mafiaMessage.create).toHaveBeenCalledTimes(1);
  });
});
