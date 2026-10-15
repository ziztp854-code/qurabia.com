import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiGameDraftToken } from '@tahaddi/contracts';
import { createMafiaGame, submitMafiaAction, submitMafiaVote } from './actions';

const AUTH_SECRET = 'test-only-auth-secret-32-characters';

const mocks = vi.hoisted(() => ({
  requireActiveUser: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  getPrismaClient: vi.fn(),
  getMafiaAccessToken: vi.fn(),
  generateUniqueActivityRoomCode: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireActiveUser: mocks.requireActiveUser,
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: mocks.getPrismaClient,
}));

vi.mock('@/lib/mafia/access-cookie', () => ({
  getMafiaAccessToken: mocks.getMafiaAccessToken,
}));

vi.mock('@/lib/mafia/engine', () => ({
  advanceMafiaGame: vi.fn(),
}));

vi.mock('@/lib/mafia/narrative', () => ({
  buildNarrativeEvent: vi.fn(),
  buildNarrative: vi.fn(),
}));

vi.mock('@/lib/mafia/rules', () => ({
  buildMafiaRoles: vi.fn(),
  resolveMafiaChatChannel: vi.fn(),
  shuffled: vi.fn(),
}));

vi.mock('@/lib/quiz/room-code', () => ({
  generateUniqueActivityRoomCode: mocks.generateUniqueActivityRoomCode,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

describe('createMafiaGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.requireActiveUser.mockResolvedValue({ id: 'host-1' } as never);
    mocks.generateUniqueActivityRoomCode.mockResolvedValue('ROOM123');
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
    mocks.getPrismaClient.mockReturnValue({
      mafiaGame: {
        create: vi.fn().mockResolvedValue({ id: 'game-1' }),
      },
    } as never);
    process.env.AUTH_SECRET = AUTH_SECRET;
  });

  it('preserves the SPEED timers shown in the creation form instead of halving them twice', async () => {
    const prisma = mocks.getPrismaClient();
    await expect(
      createMafiaGame(
        formData({ modeId: 'SPEED', nightSeconds: '23', daySeconds: '45', votingSeconds: '23' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(prisma.mafiaGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nightSeconds: 23, daySeconds: 45, votingSeconds: 23 }),
      }),
    );
  });

  it('uses mode defaults for missing or blank number fields', async () => {
    const prisma = mocks.getPrismaClient();
    await expect(
      createMafiaGame(formData({ modeId: 'SPEED', maxPlayers: '', slowModeSeconds: '' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(prisma.mafiaGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          maxPlayers: 12,
          slowModeSeconds: 2,
          nightSeconds: 23,
          daySeconds: 45,
          votingSeconds: 23,
        }),
      }),
    );
  });

  it('ينشئ غرفة Mafia مع modeId ويمرر القيم المعدّلة', async () => {
    const prisma = mocks.getPrismaClient();
    await expect(
      createMafiaGame(
        formData({
          modeId: 'CLASSIC',
          maxPlayers: '12',
          killerCount: '1',
          nightSeconds: '45',
          daySeconds: '90',
          votingSeconds: '45',
          autoMode: 'on',
          chatEnabled: 'on',
          slowModeSeconds: '2',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(prisma.mafiaGame.create).toHaveBeenCalledTimes(1);
    expect(prisma.mafiaGame.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hostId: 'host-1',
        roomCode: 'ROOM123',
        modeId: 'CLASSIC',
        maxPlayers: 12,
        killerCount: 1,
        nightSeconds: 45,
        daySeconds: 90,
        votingSeconds: 45,
        autoMode: true,
        chatEnabled: true,
        slowModeSeconds: 2,
      }),
      select: { id: true },
    });
    expect(mocks.redirect).toHaveBeenCalledWith('/mafia/game-1');
  });

  it('يستخدم وضع CLASSIC كاحتياطي عند تمرير modeId غير صالح', async () => {
    const prisma = mocks.getPrismaClient();
    await expect(
      createMafiaGame(
        formData({
          modeId: 'INVALID_MODE',
          maxPlayers: '10',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(prisma.mafiaGame.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        modeId: 'CLASSIC',
      }),
      select: { id: true },
    });
  });

  it.each(['BLIND', 'ASSASSIN', 'CHAOS'])('uses classic rules for unavailable mode %s', async (modeId) => {
    const prisma = mocks.getPrismaClient();
    prisma.mafiaGame.create.mockResolvedValue({ id: 'game-1' });
    await expect(createMafiaGame(formData({ modeId }))).rejects.toThrow('NEXT_REDIRECT');
    expect(prisma.mafiaGame.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ modeId: 'CLASSIC', nightSeconds: 45, daySeconds: 90, votingSeconds: 45 }),
      select: { id: true },
    });
  });

  it('يحفظ السيناريو المعتمد كرسائل نظام دون كشف الأدوار', async () => {
    const prisma = mocks.getPrismaClient();
    const scenario = {
      title: 'قضية القصر',
      intro: 'انطفأت الأنوار واختفى الحارس في ظروف غامضة داخل القصر.',
      clues: ['ساعة متوقفة', 'رسالة ممزقة', 'آثار طين'],
      hostBrief: 'اكشف دليلًا واحدًا مع كل نهار جديد.',
    };
    const aiScenario = createAiGameDraftToken(AUTH_SECRET, {
      game: 'mafia',
      content: scenario,
      expiresAt: Date.now() + 60_000,
    });
    await expect(createMafiaGame(formData({ modeId: 'CLASSIC', aiScenario }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(prisma.mafiaGame.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messages: {
            create: expect.arrayContaining([
              expect.objectContaining({
                channel: 'SYSTEM',
                body: expect.stringContaining('قضية القصر'),
              }),
              expect.objectContaining({
                channel: 'SYSTEM',
                body: expect.stringContaining('الدليل 1'),
              }),
            ]),
          },
        }),
      }),
    );
  });

  it('يتجاهل سيناريو Mafia غير الموقع', async () => {
    const prisma = mocks.getPrismaClient();
    await expect(
      createMafiaGame(formData({ modeId: 'CLASSIC', aiScenario: 'forged-token' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(prisma.mafiaGame.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ messages: expect.anything() }),
      select: { id: true },
    });
  });
});

describe('submitMafiaAction — تحقيق المحقق', () => {
  const actor = { id: 'detective-1', role: 'DETECTIVE', displayName: 'المحقق' };
  const target = { id: 'suspect-1', role: 'KILLER', displayName: 'سالم' };

  function detectivePrisma({
    previousInvestigation = null,
    createdCount = 1,
  }: {
    previousInvestigation?: { id: string } | null;
    createdCount?: number;
  } = {}) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'game-1', status: 'NIGHT', currentRound: 2 }]),
      mafiaParticipant: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: actor.id, role: actor.role })
          .mockResolvedValueOnce(target),
        update: vi.fn().mockResolvedValue({ id: actor.id }),
      },
      mafiaAction: {
        findFirst: vi.fn().mockResolvedValue(previousInvestigation),
        createMany: vi.fn().mockResolvedValue({ count: createdCount }),
        upsert: vi.fn(),
      },
    };
    return {
      ...tx,
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getMafiaAccessToken.mockResolvedValue('private-token');
  });

  it('يرفض إعادة التحقيق في لاعب تم التحقيق معه في جولة سابقة', async () => {
    const prisma = detectivePrisma({ previousInvestigation: { id: 'old-action' } });
    mocks.getPrismaClient.mockReturnValue(prisma as never);

    await submitMafiaAction(
      formData({
        gameId: 'game-1',
        round: '2',
        participantId: actor.id,
        targetId: target.id,
        type: 'INVESTIGATE',
      }),
    );

    expect(prisma.mafiaAction.findFirst).toHaveBeenCalledWith({
      where: {
        gameId: 'game-1',
        actorId: actor.id,
        targetId: target.id,
        type: 'INVESTIGATE',
        round: { lt: 2 },
      },
      select: { id: true },
    });
    expect(prisma.mafiaAction.createMany).not.toHaveBeenCalled();
    expect(prisma.mafiaParticipant.update).not.toHaveBeenCalled();
  });

  it('يثبت أول تحقيق في الجولة ويكتب النتيجة الخاصة للمحقق', async () => {
    const prisma = detectivePrisma();
    mocks.getPrismaClient.mockReturnValue(prisma as never);

    await submitMafiaAction(
      formData({
        gameId: 'game-1',
        round: '2',
        participantId: actor.id,
        targetId: target.id,
        type: 'INVESTIGATE',
      }),
    );

    expect(prisma.mafiaAction.createMany).toHaveBeenCalledWith({
      data: [
        {
          gameId: 'game-1',
          round: 2,
          actorId: actor.id,
          targetId: target.id,
          type: 'INVESTIGATE',
          resultIsKiller: true,
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.mafiaParticipant.update).toHaveBeenCalledWith({
      where: { id: actor.id },
      data: { privateNote: 'سالم: هو القاتل.' },
    });
  });

  it('لا يكشف نتيجة ثانية عند وصول طلب متزامن بعد تثبيت التحقيق', async () => {
    const prisma = detectivePrisma({ createdCount: 0 });
    mocks.getPrismaClient.mockReturnValue(prisma as never);

    await submitMafiaAction(
      formData({
        gameId: 'game-1',
        round: '2',
        participantId: actor.id,
        targetId: target.id,
        type: 'INVESTIGATE',
      }),
    );

    expect(prisma.mafiaParticipant.update).not.toHaveBeenCalled();
  });

  it('rejects an expired automatic night and a decision from a previous round', async () => {
    for (const game of [
      { id: 'game-1', status: 'NIGHT', currentRound: 2, autoMode: true, phaseEndsAt: new Date(0) },
      { id: 'game-1', status: 'NIGHT', currentRound: 3, autoMode: false, phaseEndsAt: null },
    ]) {
      const prisma = detectivePrisma();
      prisma.$queryRaw.mockResolvedValue([game]);
      mocks.getPrismaClient.mockReturnValue(prisma as never);
      expect(
        await submitMafiaAction(
          formData({ gameId: 'game-1', round: '2', participantId: actor.id, targetId: target.id }),
        ),
      ).toBe(false);
      expect(prisma.mafiaAction.createMany).not.toHaveBeenCalled();
      expect(prisma.mafiaParticipant.findFirst).not.toHaveBeenCalled();
    }
  });
});

describe('submitMafiaVote', () => {
  function votePrisma(
    game = {
      id: 'game-1',
      status: 'VOTING',
      currentRound: 2,
      autoMode: true,
      phaseEndsAt: new Date(Date.now() + 60000),
    },
    voter: { id: string } | null = { id: 'voter-1' },
    target: { id: string } | null = { id: 'target-1' },
  ) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([game]),
      mafiaParticipant: {
        findFirst: vi.fn().mockResolvedValueOnce(voter).mockResolvedValueOnce(target),
      },
      mafiaVote: { upsert: vi.fn().mockResolvedValue({}) },
    };
    return { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
  }
  const voteForm = () =>
    formData({ gameId: 'game-1', participantId: 'voter-1', targetId: 'target-1', round: '2' });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getMafiaAccessToken.mockResolvedValue('private-token');
  });

  it('returns acceptance after writing the vote under the phase lock', async () => {
    const prisma = votePrisma();
    mocks.getPrismaClient.mockReturnValue(prisma as never);
    expect(await submitMafiaVote(voteForm())).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.mafiaVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { gameId: 'game-1', round: 2, voterId: 'voter-1', targetId: 'target-1' },
      }),
    );
  });
  it.each([
    { status: 'DAY', currentRound: 2, autoMode: false, phaseEndsAt: null },
    { status: 'VOTING', currentRound: 3, autoMode: false, phaseEndsAt: null },
    { status: 'VOTING', currentRound: 2, autoMode: true, phaseEndsAt: new Date(0) },
  ])('rejects votes for a closed, expired, or later round: %j', async (game) => {
    const prisma = votePrisma({ id: 'game-1', ...game } as never);
    mocks.getPrismaClient.mockReturnValue(prisma as never);
    expect(await submitMafiaVote(voteForm())).toBe(false);
    expect(prisma.mafiaVote.upsert).not.toHaveBeenCalled();
  });
  it.each([
    [null, { id: 'target-1' }],
    [{ id: 'voter-1' }, null],
  ])('rejects unavailable or unauthorized participants', async (voter, target) => {
    const prisma = votePrisma(undefined, voter, target);
    mocks.getPrismaClient.mockReturnValue(prisma as never);
    expect(await submitMafiaVote(voteForm())).toBe(false);
    expect(prisma.mafiaVote.upsert).not.toHaveBeenCalled();
  });
  it('accepts manual votes until the host closes the phase', async () => {
    const prisma = votePrisma({
      id: 'game-1',
      status: 'VOTING',
      currentRound: 2,
      autoMode: false,
      phaseEndsAt: new Date(0),
    });
    mocks.getPrismaClient.mockReturnValue(prisma as never);
    expect(await submitMafiaVote(voteForm())).toBe(true);
  });
});
