/* eslint-disable @typescript-eslint/require-await -- asynchronous test doubles model Redis methods */
/* eslint-disable @typescript-eslint/unbound-method --
 * The jest matcher API (toHaveBeenCalled etc.) detaches the matcher
 * function from the mock object; this is safe and idiomatic, but the
 * type-checker flags it. The trade-off is worth it for readable tests.
 */
import { Test, TestingModule } from '@nestjs/testing';
import type { LadderRoomRuntime } from '../ladder.types.js';
import { DatabaseService } from '../../game/database.service.js';
import { RedisService } from '../../game/redis.service.js';
import { LadderService } from '../ladder.service.js';

type FindManyQuery = {
  take: number;
  where: {
    status: string;
    type: { in: string[] };
    category: { is: { isActive: boolean } };
    gameTypes: { has: string };
    id?: { notIn: string[] };
  };
};

describe('LadderService', () => {
  let service: LadderService;
  let redis: jest.Mocked<RedisService>;
  let findManyQuestions: jest.Mock;

  const mockRedis = {
    loadLadderRoom: jest.fn(),
    saveLadderRoom: jest.fn(),
    deleteLadderRoom: jest.fn(),
    addActiveLadderRoomCode: jest.fn(),
    removeActiveLadderRoomCode: jest.fn(),
    isLadderRoomCodeActive: jest.fn(),
    setLadderGuestIdentity: jest.fn(),
    getLadderGuestIdentity: jest.fn(),
    deleteLadderGuestIdentity: jest.fn(),
    deleteExpiredLadderGuestIdentity: jest.fn(),
    acquireLadderRoomLock: jest.fn(),
    releaseLadderRoomLock: jest.fn(),
    consumeRateLimit: jest.fn(),
  } as unknown as jest.Mocked<RedisService>;

  const publishedQuestion = (
    id: string,
    optionsCount: 2 | 4 = 2,
    difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'EASY',
    categoryId = 'science',
  ) => ({
    id,
    prompt: `سؤال ${id}`,
    status: 'PUBLISHED' as const,
    type:
      optionsCount === 2
        ? ('TRUE_FALSE' as const)
        : ('MULTIPLE_CHOICE' as const),
    difficulty,
    categoryId,
    category: { id: categoryId, name: `تصنيف ${categoryId}`, isActive: true },
    timeLimit: 20,
    gameTypes: ['QUIZ'] as const,
    options: Array.from({ length: optionsCount }, (_, index) => ({
      id: `${id}-option-${index + 1}`,
      text: `الخيار ${index + 1}`,
      position: index,
      isCorrect: index === 0,
    })),
  });

  const activeRoom = (
    question = publishedQuestion('bank-q1'),
  ): LadderRoomRuntime => {
    const openedAt = Date.now();
    return {
      roomCode: 'AB12CD34',
      hostId: 'guest_right',
      status: 'active',
      currentRound: 1,
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      currentQuestion: {
        id: question.id,
        roomId: 'AB12CD34',
        questionText: question.prompt,
        options: question.options.map(({ id, text }) => ({ id, text })),
        correctOptionId: question.options[0].id,
        category: question.category,
        difficulty: question.difficulty,
        timeLimit: question.timeLimit,
        roundNumber: 1,
        createdAt: openedAt,
      },
      teams: [
        {
          id: 'guest_right',
          team: 'right',
          playerName: 'يمين',
          isHost: true,
          joinedAt: openedAt,
        },
        {
          id: 'guest_left',
          team: 'left',
          playerName: 'يسار',
          isHost: false,
          joinedAt: openedAt,
        },
      ],
      startedAt: openedAt,
      createdAt: openedAt,
      updatedAt: openedAt,
      usedQuestionIds: [question.id],
      recentCategoryIds: [question.category.id],
      currentQuestionId: question.id,
      currentDifficulty: question.difficulty,
      questionOpenedAt: openedAt,
      questionDeadlineAt: openedAt + question.timeLimit * 1000,
      currentCorrectOptionId: question.options[0].id,
    } as unknown as LadderRoomRuntime;
  };

  beforeEach(async () => {
    findManyQuestions = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LadderService,
        { provide: RedisService, useValue: mockRedis },
        {
          provide: DatabaseService,
          useValue: { client: { question: { findMany: findManyQuestions } } },
        },
      ],
    }).compile();

    service = module.get<LadderService>(LadderService);
    redis = module.get(RedisService);
    jest.clearAllMocks();
    redis.acquireLadderRoomLock.mockResolvedValue(true);
    redis.releaseLadderRoomLock.mockResolvedValue(undefined);
    redis.saveLadderRoom.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('central question bank', () => {
    const waitingRoom = (): LadderRoomRuntime => ({
      roomCode: 'AB12CD34',
      hostId: 'guest_right',
      status: 'waiting',
      currentRound: 0,
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      currentQuestion: null,
      teams: [
        {
          id: 'guest_right',
          team: 'right',
          playerName: 'يمين',
          isHost: true,
          joinedAt: 0,
        },
        {
          id: 'guest_left',
          team: 'left',
          playerName: 'يسار',
          isHost: false,
          joinedAt: 0,
        },
      ],
      createdAt: 0,
      updatedAt: 0,
    });

    it('queries only published active-category MCQ/true-false candidates with a bounded pool', async () => {
      let capturedQuery: unknown;
      redis.loadLadderRoom.mockResolvedValue(waitingRoom());
      findManyQuestions.mockImplementation((query: unknown) => {
        capturedQuery = query;
        return Promise.resolve([publishedQuestion('two-options', 2)]);
      });

      const result = await service.startGame('AB12CD34', 'guest_right');

      expect(result.ok).toBe(true);
      expect(findManyQuestions).toHaveBeenCalledTimes(1);
      const query = capturedQuery as FindManyQuery;
      expect(query.where.status).toBe('PUBLISHED');
      expect(query.where.type).toEqual({
        in: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
      });
      expect(query.where.category).toEqual({ is: { isActive: true } });
      expect(query.where.gameTypes).toEqual({ has: 'LADDER' });
      expect(query.take).toBeLessThanOrEqual(80);
      if (result.ok) {
        expect(result.room.currentQuestion?.options).toHaveLength(2);
      }
    });

    it('accepts a valid four-option question', async () => {
      redis.loadLadderRoom.mockResolvedValue(waitingRoom());
      findManyQuestions.mockResolvedValue([
        publishedQuestion('four-options', 4),
      ]);

      const result = await service.startGame('AB12CD34', 'guest_right');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.currentQuestion?.options).toHaveLength(4);
      }
    });

    it('uses the host minimum question time when a bank question is faster', async () => {
      const room = waitingRoom();
      room.questionTimeLimit = 30;
      redis.loadLadderRoom.mockResolvedValue(room);
      findManyQuestions.mockResolvedValue([
        publishedQuestion('minimum-time', 4),
      ]);

      const result = await service.startGame('AB12CD34', 'guest_right');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.currentQuestion?.timeLimit).toBe(30);
        expect(result.room.questionDeadlineAt).toBe(
          result.room.questionOpenedAt! + 30_000,
        );
      }
    });

    it.each([
      ['EASY', 20],
      ['MEDIUM', 30],
      ['HARD', 45],
    ] as const)(
      'uses the automatic time for actual %s questions',
      async (difficulty, seconds) => {
        const room = { ...waitingRoom(), automaticQuestionTime: true };
        redis.loadLadderRoom.mockResolvedValue(room);
        findManyQuestions.mockResolvedValue([
          publishedQuestion('auto', 4, difficulty),
        ]);
        const result = await service.startGame('AB12CD34', 'guest_right');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.room.currentQuestion?.timeLimit).toBe(seconds);
          expect(result.room.questionDeadlineAt).toBe(
            result.room.questionOpenedAt! + seconds * 1000,
          );
        }
      },
    );

    it('skips candidates outside the supported two-to-four option range', async () => {
      const oneOption = publishedQuestion('one-option', 2);
      oneOption.options = oneOption.options.slice(0, 1);
      const fiveOptions = publishedQuestion('five-options', 4);
      fiveOptions.options = [
        ...fiveOptions.options,
        {
          id: 'five-options-option-5',
          text: 'الخيار 5',
          position: 4,
          isCorrect: false,
        },
      ];
      redis.loadLadderRoom.mockResolvedValue(waitingRoom());
      findManyQuestions.mockResolvedValue([
        oneOption,
        fiveOptions,
        publishedQuestion('valid-four', 4),
      ]);

      const result = await service.startGame('AB12CD34', 'guest_right');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.currentQuestion?.id).toBe('valid-four');
      }
    });

    it('does not expose the correct answer in the public snapshot', () => {
      const room = activeRoom();

      // A room persisted by an older version may contain private option metadata.
      Object.assign(room.currentQuestion!.options[0], { isCorrect: true });
      const snapshot = service.buildSnapshot(room, 'right', 'guest_right');

      expect(snapshot.currentQuestion).not.toHaveProperty('correctOptionId');
      expect(snapshot.currentQuestion!.options[0]).not.toHaveProperty(
        'isCorrect',
      );
      expect(JSON.stringify(snapshot)).not.toContain('currentCorrectOptionId');
    });

    it('reports only the server-authoritative remaining time after reconnect', () => {
      const room = activeRoom();
      jest
        .spyOn(Date, 'now')
        .mockReturnValue((room.questionOpenedAt ?? 0) + 5_000);

      const snapshot = service.buildSnapshot(room, 'right', 'guest_right');

      expect(snapshot.currentQuestion?.timeLimit).toBe(15);
    });

    it('returns a clear error and keeps the room waiting when the valid pool is empty', async () => {
      redis.loadLadderRoom.mockResolvedValue(waitingRoom());
      findManyQuestions.mockResolvedValue([]);

      const result = await service.startGame('AB12CD34', 'guest_right');

      expect(result).toEqual({
        ok: false,
        code: 'NO_QUESTIONS_AVAILABLE',
        message: 'لا توجد أسئلة صالحة متاحة للعبة السلم حاليًا.',
      });
      expect(redis.saveLadderRoom).not.toHaveBeenCalled();
    });
  });

  describe('answer security and scoring', () => {
    it('persists the guest identity only after a successful room join', async () => {
      const room = { ...activeRoom(), status: 'waiting' as const, teams: [] };
      redis.loadLadderRoom.mockResolvedValue(room);
      const result = await service.joinRoom(
        { roomCode: room.roomCode, playerName: 'لاعب', team: 'right' },
        'guest-new',
        'token-new',
      );
      expect(result.ok).toBe(true);
      expect(redis.saveLadderRoom).toHaveBeenCalledWith(
        room.roomCode,
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ guestId: 'guest-new' }),
        undefined,
      );
    });
    it('does not create an identity from a rejected join before reconnect', async () => {
      const room = activeRoom();
      redis.loadLadderRoom.mockResolvedValue(room);
      redis.getLadderGuestIdentity.mockResolvedValue(null);
      expect(
        await service.validateGuest('guest_right', 'new-token'),
      ).not.toBeNull();
      const rejected = await service.joinRoom(
        { roomCode: room.roomCode, playerName: 'لاعب', team: 'right' },
        'guest_right',
        'new-token',
      );
      expect(rejected).toMatchObject({ ok: false, code: 'GAME_STARTED' });
      expect(redis.setLadderGuestIdentity).not.toHaveBeenCalled();
      expect(
        await service.validateGuest('guest_right', 'new-token', false),
      ).toBeNull();
    });
    it('rejects reconnect identity recreation if the guest record disappeared', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue(null);
      expect(
        await service.validateGuest('guest_right', 'new-token', false),
      ).toBeNull();
      expect(redis.setLadderGuestIdentity).not.toHaveBeenCalled();
    });

    it('records each answer privately and reveals only after both submit', async () => {
      let room = activeRoom();
      redis.loadLadderRoom.mockImplementation(async () =>
        structuredClone(room),
      );
      redis.saveLadderRoom.mockImplementation(async (_code, value) => {
        room = structuredClone(value as LadderRoomRuntime);
        return room.revision ?? 1;
      });
      const id = room.currentQuestion!.id;
      const right = await service.submitAnswer(
        'guest_right',
        room.roomCode,
        id,
        room.currentQuestion!.options[0].id,
      );
      expect(right.ok).toBe(true);
      expect(room.rightPosition).toBe(0);
      expect(
        service.buildSnapshot(room, 'left', 'guest_left').myAnswer,
      ).toBeNull();
      expect(
        service.buildSnapshot(room, 'left', 'guest_left').roundResult,
      ).toBeNull();
      expect(
        await service.submitAnswer(
          'guest_right',
          room.roomCode,
          id,
          room.currentQuestion!.options[0].id,
        ),
      ).toMatchObject({ ok: false, code: 'ALREADY_ANSWERED' });
      expect(
        (
          await service.submitAnswer(
            'guest_left',
            room.roomCode,
            id,
            room.currentQuestion!.options[0].id,
          )
        ).ok,
      ).toBe(true);
      expect(room.rightPosition).toBe(1);
      expect(room.leftPosition).toBe(1);
      expect(room.roundResult?.right.correct).toBe(true);
      expect(room.roundResult?.left.correct).toBe(true);
      expect(room.roundHistory).toHaveLength(1);
      expect(await service.advanceRound(room.roomCode, id)).toMatchObject({
        ok: false,
        code: 'REVEAL_NOT_FINISHED',
      });
    });

    it('serializes simultaneous submissions without dropping either answer', async () => {
      let room = activeRoom();
      let held = false;
      redis.acquireLadderRoomLock.mockImplementation(async () => {
        if (held) return false;
        held = true;
        return true;
      });
      redis.releaseLadderRoomLock.mockImplementation(async () => {
        held = false;
      });
      redis.loadLadderRoom.mockImplementation(async () =>
        structuredClone(room),
      );
      redis.saveLadderRoom.mockImplementation(async (_code, value) => {
        room = structuredClone(value as LadderRoomRuntime);
        return room.revision ?? 1;
      });
      const q = room.currentQuestion!;
      const results = await Promise.all([
        service.submitAnswer(
          'guest_right',
          room.roomCode,
          q.id,
          q.options[0].id,
        ),
        service.submitAnswer(
          'guest_left',
          room.roomCode,
          q.id,
          q.options[0].id,
        ),
      ]);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(room.rightPosition).toBe(1);
      expect(room.leftPosition).toBe(1);
      expect(room.roundHistory).toHaveLength(1);
    });

    it('uses server receipt time even if processing is delayed across the deadline', async () => {
      let room = activeRoom();
      redis.loadLadderRoom.mockImplementation(async () =>
        structuredClone(room),
      );
      redis.saveLadderRoom.mockImplementation(async (_code, value) => {
        room = structuredClone(value as LadderRoomRuntime);
        return room.revision ?? 1;
      });
      const deadline = room.questionDeadlineAt!;
      jest.spyOn(Date, 'now').mockReturnValue(deadline + 50);
      const q = room.currentQuestion!;
      expect(
        (
          await service.submitAnswer(
            'guest_right',
            room.roomCode,
            q.id,
            q.options[0].id,
            deadline - 1,
          )
        ).ok,
      ).toBe(true);
      expect(room.answers?.right?.elapsedMs).toBe(19_999);
      expect(
        await service.submitAnswer(
          'guest_left',
          room.roomCode,
          q.id,
          q.options[0].id,
          deadline,
        ),
      ).toMatchObject({ ok: false, code: 'QUESTION_EXPIRED' });
    });

    it('enforces option, player, deadline and timeout rules', async () => {
      let room = activeRoom();
      room.rightPosition = 2;
      room.rightScore = 1000;
      redis.loadLadderRoom.mockImplementation(async () =>
        structuredClone(room),
      );
      redis.saveLadderRoom.mockImplementation(async (_code, value) => {
        room = structuredClone(value as LadderRoomRuntime);
        return room.revision ?? 1;
      });
      const id = room.currentQuestion!.id;
      expect(
        await service.submitAnswer('guest_right', room.roomCode, id, 'forged'),
      ).toMatchObject({ ok: false, code: 'INVALID_OPTION' });
      expect(
        await service.submitAnswer(
          'stranger',
          room.roomCode,
          id,
          room.currentQuestion!.options[0].id,
        ),
      ).toMatchObject({ ok: false, code: 'NOT_A_PLAYER' });
      jest.spyOn(Date, 'now').mockReturnValue(room.questionDeadlineAt!);
      expect(
        await service.submitAnswer(
          'guest_right',
          room.roomCode,
          id,
          room.currentQuestion!.options[0].id,
        ),
      ).toMatchObject({ ok: false, code: 'QUESTION_EXPIRED' });
      expect((await service.expireQuestion(room.roomCode, id)).ok).toBe(true);
      expect(room.rightPosition).toBe(1);
      expect(room.leftPosition).toBe(0);
      expect(room.rightScore).toBe(850);
      expect(room.roundResult?.right.elapsedMs).toBeNull();
      expect(room.roundResult?.left.points).toBe(0);
    });
  });

  describe('ten-round game flow', () => {
    it('persists one lottery result through repeat advancement and reconnect snapshots', async () => {
      let held = false;
      redis.acquireLadderRoomLock.mockImplementation(async () => {
        if (held) return false;
        held = true;
        return true;
      });
      redis.releaseLadderRoomLock.mockImplementation(async () => {
        held = false;
      });
      let room: LadderRoomRuntime = {
        ...activeRoom(),
        currentRound: 10,
        revealUntil: Date.now() - 1,
      };
      const q = room.currentQuestion!;
      const answer = {
        optionId: q.options[0].id,
        correct: true,
        elapsedMs: 1000,
        points: 1000,
      };
      const result = {
        roundNumber: 10,
        questionId: q.id,
        questionText: q.questionText,
        options: q.options,
        correctOptionId: q.options[0].id,
        right: answer,
        left: answer,
      };
      room = { ...room, roundResult: result, roundHistory: [result] };
      redis.loadLadderRoom.mockImplementation(async () =>
        structuredClone(room),
      );
      redis.saveLadderRoom.mockImplementation(async (_code, value) => {
        room = structuredClone(value as LadderRoomRuntime);
        return room.revision ?? 1;
      });
      const results = await Promise.all([
        service.advanceRound(room.roomCode, q.id),
        service.advanceRound(room.roomCode, q.id),
      ]);
      expect(results.filter((value) => value.ok)).toHaveLength(1);
      expect(room.winnerMethod).toBe('lottery');
      expect(['right', 'left']).toContain(room.winner);
      expect(service.buildSnapshot(room, 'right', 'guest_right').winner).toBe(
        room.winner,
      );
      expect(service.buildSnapshot(room, 'left', 'guest_left').winner).toBe(
        room.winner,
      );
      expect(
        await service.handleReconnect('guest_left', room.roomCode),
      ).toMatchObject({
        ok: true,
        room: { winner: room.winner, winnerMethod: 'lottery' },
      });
    });

    it('plays ten shared questions without an eleventh and awards the higher score on a position tie', async () => {
      let now = 1_800_000_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      let room = {
        ...activeRoom(),
        status: 'waiting' as const,
        currentRound: 0,
        currentQuestion: null,
        usedQuestionIds: [],
        recentCategoryIds: [],
      } as LadderRoomRuntime;
      redis.loadLadderRoom.mockImplementation(async () =>
        structuredClone(room),
      );
      redis.saveLadderRoom.mockImplementation(async (_code, value) => {
        room = structuredClone(value as LadderRoomRuntime);
        return room.revision ?? 1;
      });
      findManyQuestions.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => publishedQuestion(`q-${i}`)),
      );
      expect((await service.startGame(room.roomCode, room.hostId)).ok).toBe(
        true,
      );
      for (let i = 1; i <= 10; i++) {
        const q = room.currentQuestion!;
        now += 1000;
        expect(
          (
            await service.submitAnswer(
              'guest_right',
              room.roomCode,
              q.id,
              q.options[0].id,
            )
          ).ok,
        ).toBe(true);
        now += 1000;
        expect(
          (
            await service.submitAnswer(
              'guest_left',
              room.roomCode,
              q.id,
              q.options[0].id,
            )
          ).ok,
        ).toBe(true);
        expect(room.currentRound).toBe(i);
        now += 4001;
        expect((await service.advanceRound(room.roomCode, q.id)).ok).toBe(true);
      }
      expect(room.status).toBe('finished');
      expect(room.currentRound).toBe(10);
      expect(room.rightPosition).toBe(10);
      expect(room.leftPosition).toBe(10);
      expect(room.roundHistory).toHaveLength(10);
      expect(service.buildSnapshot(room).winner).toBe('right');
      expect(
        new Set(room.roundHistory!.map((result) => result.questionId)).size,
      ).toBe(10);
    });
  });

  describe('validateGuest', () => {
    it('returns null when no token is provided', async () => {
      const result = await service.validateGuest('guest_123');
      expect(result).toBeNull();
    });

    it('returns a provisional identity without persisting it before an accepted join', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue(null);
      redis.setLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).not.toBeNull();
      expect(result?.guestId).toBe('guest_123');
      expect(result?.guestToken).toBe('token_abc');
      expect(redis.setLadderGuestIdentity).not.toHaveBeenCalled();
    });

    it('returns the stored identity when token matches and has not expired', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue({
        guestId: 'guest_123',
        guestToken: 'token_abc',
        createdAt: Date.now() - 60_000,
        expiresAt: Date.now() + 3_600_000,
      });

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).not.toBeNull();
      expect(result?.guestId).toBe('guest_123');
      // No re-write when the existing identity is still valid
      expect(redis.setLadderGuestIdentity).not.toHaveBeenCalled();
    });

    it('returns null when the token does not match (recovery relies on rotating guestId)', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue({
        guestId: 'guest_123',
        guestToken: 'token_abc',
        createdAt: Date.now() - 60_000,
        expiresAt: Date.now() + 3_600_000,
      });

      const result = await service.validateGuest('guest_123', 'token_xyz');

      expect(result).toBeNull();
      // The stale identity is left in place; the client recovery flow
      // rotates the guestId (not just the token), which lands in the
      // "no record" branch that auto-mints a fresh identity.
      expect(redis.setLadderGuestIdentity).not.toHaveBeenCalled();
    });

    it('returns null and deletes the identity when expired (3h TTL)', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue({
        guestId: 'guest_123',
        guestToken: 'token_abc',
        createdAt: Date.now() - 4 * 60 * 60 * 1000, // 4 hours ago
        expiresAt: Date.now() - 60 * 60 * 1000, // 1 hour ago
      });
      redis.deleteExpiredLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).toBeNull();
      expect(redis.deleteExpiredLadderGuestIdentity).toHaveBeenCalled();
    });

    it('keeps an identity valid at the exact moment of expiry (strictly-after check)', async () => {
      const now = 1_700_000_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
      redis.getLadderGuestIdentity.mockResolvedValue({
        guestId: 'guest_123',
        guestToken: 'token_abc',
        createdAt: now - 3_600_000,
        expiresAt: now,
      });

      const result = await service.validateGuest('guest_123', 'token_abc');

      // The current implementation uses `Date.now() > identity.expiresAt`,
      // so an identity whose expiresAt === now is still accepted. The TTL
      // is enforced via the 24h Redis EXPIRE; this is a defence-in-depth
      // check, not the primary mechanism.
      expect(result).not.toBeNull();
      dateSpy.mockRestore();
    });

    it('rejects an identity whose expiresAt is in the past by a millisecond', async () => {
      const now = 1_700_000_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
      redis.getLadderGuestIdentity.mockResolvedValue({
        guestId: 'guest_123',
        guestToken: 'token_abc',
        createdAt: now - 3_600_000,
        expiresAt: now - 1,
      });
      redis.deleteExpiredLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).toBeNull();
      expect(redis.deleteExpiredLadderGuestIdentity).toHaveBeenCalled();
      dateSpy.mockRestore();
    });
  });

  describe('createRoom', () => {
    it('creates a host-owned room without adding the host to either team', async () => {
      redis.isLadderRoomCodeActive.mockResolvedValue(false);
      redis.saveLadderRoom.mockResolvedValue(1);
      redis.addActiveLadderRoomCode.mockResolvedValue(undefined);
      redis.setLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.createRoom(
        {
          totalRounds: 10,
          winningPosition: 10,
          questionTimeLimit: 30,
        },
        'user_host',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.hostId).toBe('user_host');
        expect(result.room.teams).toHaveLength(0);
        expect(result.room.questionTimeLimit).toBe(30);
      }
      expect(redis.setLadderGuestIdentity).not.toHaveBeenCalled();
    });
  });

  describe('identity rotation on reconnect', () => {
    it('accepts a new guestId/token pair that the server has never seen (auto-mints identity)', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue(null);
      redis.setLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('fresh_guest', 'fresh_token');

      // When the client clears its storage and re-joins with a new pair,
      // the server's `validateGuest` self-mints an identity on the
      // first call. The host/join handlers rely on this so the
      // recovery flow always succeeds.
      expect(result).not.toBeNull();
      expect(result?.guestToken).toBe('fresh_token');
    });
  });

  describe('handleReconnect', () => {
    const waitingRoom: LadderRoomRuntime = {
      roomCode: 'AB12CD34',
      hostId: 'host_1',
      status: 'waiting',
      currentRound: 0,
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      currentQuestion: null,
      teams: [
        {
          id: 'host_1',
          team: 'right',
          playerName: 'عبدالعزيز',
          isHost: true,
          joinedAt: 0,
        },
      ],
      createdAt: 0,
      updatedAt: 0,
    };

    it('rejects a reconnect when the guestId is not in the room roster', async () => {
      redis.loadLadderRoom.mockResolvedValue(waitingRoom);

      const result = await service.handleReconnect(
        'stranger_guest',
        'AB12CD34',
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_IN_ROOM');
      }
    });

    it('accepts a reconnect for a known participant', async () => {
      redis.loadLadderRoom.mockResolvedValue(waitingRoom);

      const result = await service.handleReconnect('host_1', 'AB12CD34');

      expect(result.ok).toBe(true);
    });
  });
});
