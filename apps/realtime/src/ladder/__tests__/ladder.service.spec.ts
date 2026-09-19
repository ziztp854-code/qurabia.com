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

      const snapshot = service.buildSnapshot(room, 'right', 'guest_right');

      expect(snapshot.currentQuestion).not.toHaveProperty('correctOptionId');
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
    it('rejects an option that does not belong to the current question', async () => {
      const room = activeRoom();
      redis.loadLadderRoom.mockResolvedValue(room);

      const result = await service.submitAnswer(
        'guest_right',
        room.roomCode,
        room.currentQuestion!.id,
        'forged-option',
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('INVALID_OPTION');
      expect(redis.saveLadderRoom).not.toHaveBeenCalled();
    });

    it('rejects an answer after the server-side deadline without changing score or position', async () => {
      const room = activeRoom();
      redis.loadLadderRoom.mockResolvedValue(room);
      jest.spyOn(Date, 'now').mockReturnValue(room.questionDeadlineAt! + 1);

      const result = await service.submitAnswer(
        'guest_right',
        room.roomCode,
        room.currentQuestion!.id,
        room.currentQuestion!.options[0].id,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('QUESTION_EXPIRED');
      expect(room.rightScore).toBe(0);
      expect(room.rightPosition).toBe(0);
    });

    it('uses the authenticated guest identity to credit and move the correct team', async () => {
      let capturedQuery: unknown;
      const room = activeRoom();
      room.teams = room.teams.map((member) => ({
        ...member,
        id: `${member.id}-roster-id`,
      }));
      redis.loadLadderRoom.mockResolvedValue(room);
      redis.getLadderGuestIdentity.mockResolvedValue({
        guestId: 'guest_right',
        guestToken: 'token',
        roomCode: room.roomCode,
        team: 'right',
        createdAt: 0,
        expiresAt: Date.now() + 10_000,
      });
      findManyQuestions.mockImplementation((query: unknown) => {
        capturedQuery = query;
        return Promise.resolve([
          publishedQuestion('bank-q2', 2, 'EASY', 'history'),
        ]);
      });

      const result = await service.submitAnswer(
        'guest_right',
        room.roomCode,
        room.currentQuestion!.id,
        room.currentQuestion!.options[0].id,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.rightScore).toBe(100);
        expect(result.room.rightPosition).toBe(1);
        expect(result.room.leftScore).toBe(0);
        expect(result.room.leftPosition).toBe(0);
        expect(result.room.usedQuestionIds).toEqual(['bank-q1', 'bank-q2']);
        expect(result.room.currentDifficulty).toBe('EASY');
      }
      const query = capturedQuery as FindManyQuery;
      expect(query.where.id).toEqual({ notIn: ['bank-q1'] });
    });

    it('applies a wrong answer movement to the authenticated left team only', async () => {
      const room = activeRoom();
      room.leftPosition = 2;
      redis.loadLadderRoom.mockResolvedValue(room);
      findManyQuestions.mockResolvedValue([
        publishedQuestion('bank-q2', 2, 'EASY', 'history'),
      ]);

      const result = await service.submitAnswer(
        'guest_left',
        room.roomCode,
        room.currentQuestion!.id,
        room.currentQuestion!.options[1].id,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.leftPosition).toBe(1);
        expect(result.room.leftScore).toBe(0);
        expect(result.room.rightPosition).toBe(0);
        expect(result.room.rightScore).toBe(0);
      }
    });

    it('advances the round from the server when the question deadline expires', async () => {
      const room = activeRoom();
      redis.loadLadderRoom.mockResolvedValue(room);
      findManyQuestions.mockResolvedValue([
        publishedQuestion('bank-q2', 2, 'EASY', 'history'),
      ]);
      jest.spyOn(Date, 'now').mockReturnValue(room.questionDeadlineAt! + 1);

      const result = await service.expireQuestion(
        room.roomCode,
        room.currentQuestion!.id,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.currentRound).toBe(2);
        expect(result.room.currentQuestion?.id).toBe('bank-q2');
        expect(result.room.rightScore).toBe(0);
        expect(result.room.leftScore).toBe(0);
      }
    });

    it('stops clearly instead of repeating when the pool is exhausted mid-game', async () => {
      const room = activeRoom();
      redis.loadLadderRoom.mockResolvedValue(room);
      findManyQuestions.mockResolvedValue([]);

      const result = await service.submitAnswer(
        'guest_right',
        room.roomCode,
        room.currentQuestion!.id,
        room.currentQuestion!.options[0].id,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.room.status).toBe('finished');
        expect(result.room.currentQuestion).toBeNull();
        expect(result.room.stopReason).toEqual({
          code: 'NO_QUESTIONS_AVAILABLE',
          message: 'نفدت الأسئلة الصالحة غير المكررة لهذه الغرفة.',
        });
      }
    });
  });

  describe('multi-round bank flow', () => {
    it('runs consecutive correct, wrong, and timeout rounds without repetition', async () => {
      let now = 1_800_000_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      let storedRoom: LadderRoomRuntime = {
        roomCode: 'AB12CD34',
        hostId: 'guest_right',
        status: 'waiting',
        currentRound: 0,
        totalRounds: 5,
        rightScore: 0,
        leftScore: 0,
        rightPosition: 0,
        leftPosition: 0,
        winningPosition: 5,
        currentQuestion: null,
        teams: [
          {
            id: 'guest_right',
            team: 'right',
            playerName: 'يمين',
            isHost: true,
            joinedAt: now,
          },
          {
            id: 'guest_left',
            team: 'left',
            playerName: 'يسار',
            isHost: false,
            joinedAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      const pool = [
        publishedQuestion('q-easy', 2, 'EASY', 'science'),
        publishedQuestion('q-medium-1', 4, 'MEDIUM', 'history'),
        publishedQuestion('q-medium-2', 2, 'MEDIUM', 'culture'),
        publishedQuestion('q-hard', 4, 'HARD', 'science'),
      ];
      const seenQuestionIds: string[] = [];
      redis.loadLadderRoom.mockImplementation(() =>
        Promise.resolve(storedRoom),
      );
      redis.saveLadderRoom.mockImplementation((_roomCode, room) => {
        storedRoom = structuredClone(room as LadderRoomRuntime);
        return Promise.resolve();
      });
      findManyQuestions.mockResolvedValue(pool);

      const started = await service.startGame('AB12CD34', 'guest_right');
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      seenQuestionIds.push(started.room.currentQuestion!.id);
      expect(started.room.currentDifficulty).toBe('EASY');

      now += 1_000;
      const correct = await service.submitAnswer(
        'guest_right',
        storedRoom.roomCode,
        storedRoom.currentQuestion!.id,
        storedRoom.currentQuestion!.options[0].id,
      );
      expect(correct.ok).toBe(true);
      if (!correct.ok) return;
      seenQuestionIds.push(correct.room.currentQuestion!.id);
      expect(correct.room.currentDifficulty).toBe('MEDIUM');
      expect(correct.room.rightScore).toBe(100);
      expect(correct.room.rightPosition).toBe(1);

      now += 1_000;
      const wrong = await service.submitAnswer(
        'guest_left',
        storedRoom.roomCode,
        storedRoom.currentQuestion!.id,
        storedRoom.currentQuestion!.options[1].id,
      );
      expect(wrong.ok).toBe(true);
      if (!wrong.ok) return;
      seenQuestionIds.push(wrong.room.currentQuestion!.id);
      expect(wrong.room.currentDifficulty).toBe('MEDIUM');
      expect(wrong.room.leftScore).toBe(0);

      now = storedRoom.questionDeadlineAt!;
      const timedOut = await service.expireQuestion(
        storedRoom.roomCode,
        storedRoom.currentQuestion!.id,
      );
      expect(timedOut.ok).toBe(true);
      if (!timedOut.ok) return;
      seenQuestionIds.push(timedOut.room.currentQuestion!.id);
      expect(timedOut.room.currentDifficulty).toBe('HARD');
      expect(new Set(seenQuestionIds).size).toBe(seenQuestionIds.length);
      expect(timedOut.room.usedQuestionIds).toEqual(seenQuestionIds);
    });
  });

  describe('validateGuest', () => {
    it('returns null when no token is provided', async () => {
      const result = await service.validateGuest('guest_123');
      expect(result).toBeNull();
    });

    it('creates a fresh identity when no record exists for the guestId', async () => {
      redis.getLadderGuestIdentity.mockResolvedValue(null);
      redis.setLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).not.toBeNull();
      expect(result?.guestId).toBe('guest_123');
      expect(result?.guestToken).toBe('token_abc');
      // Side effect: a new identity is written to Redis
      expect(redis.setLadderGuestIdentity).toHaveBeenCalled();
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
      redis.deleteLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).toBeNull();
      expect(redis.deleteLadderGuestIdentity).toHaveBeenCalled();
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
      redis.deleteLadderGuestIdentity.mockResolvedValue(undefined);

      const result = await service.validateGuest('guest_123', 'token_abc');

      expect(result).toBeNull();
      expect(redis.deleteLadderGuestIdentity).toHaveBeenCalled();
      dateSpy.mockRestore();
    });
  });

  describe('createRoom', () => {
    it('creates a host-owned room without adding the host to either team', async () => {
      redis.isLadderRoomCodeActive.mockResolvedValue(false);
      redis.saveLadderRoom.mockResolvedValue(undefined);
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
