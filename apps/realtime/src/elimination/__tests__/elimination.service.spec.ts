import { Test, TestingModule } from '@nestjs/testing';
import type { EliminationPlayer } from '@tahaddi/domain';
import type { EliminationRoomRuntime } from '../elimination.types.js';
import { DatabaseService } from '../../game/database.service.js';
import { RedisService } from '../../game/redis.service.js';
import { EliminationService } from '../elimination.service.js';

describe('EliminationService', () => {
  let service: EliminationService;
  let redis: {
    loadEliminationRoom: jest.Mock;
    saveEliminationRoom: jest.Mock;
    deleteEliminationRoom: jest.Mock;
    addActiveEliminationRoomCode: jest.Mock;
    removeActiveEliminationRoomCode: jest.Mock;
    isEliminationRoomCodeActive: jest.Mock;
    setEliminationGuestIdentity: jest.Mock;
    getEliminationGuestIdentity: jest.Mock;
    deleteEliminationGuestIdentity: jest.Mock;
    acquireEliminationRoomLock: jest.Mock;
    releaseEliminationRoomLock: jest.Mock;
    consumeRateLimit: jest.Mock;
  };
  let findManyQuestions: jest.Mock;

  const questionRow = (id: string, difficulty: string, correctIndex = 0) => ({
    id,
    prompt: `سؤال ${id}؟`,
    difficulty,
    options: [
      { id: `${id}-o1`, position: 1, text: 'أ', isCorrect: correctIndex === 0 },
      { id: `${id}-o2`, position: 2, text: 'ب', isCorrect: correctIndex === 1 },
      { id: `${id}-o3`, position: 3, text: 'ج', isCorrect: correctIndex === 2 },
      { id: `${id}-o4`, position: 4, text: 'د', isCorrect: correctIndex === 3 },
    ],
  });

  const player = (
    id: string,
    name: string,
    overrides: Partial<EliminationPlayer> = {},
  ): EliminationPlayer => ({
    id,
    name,
    alive: true,
    eliminatedAtRound: null,
    answer: null,
    joinedAt: 1,
    ...overrides,
  });

  const activeRoom = (): EliminationRoomRuntime => {
    const openedAt = Date.now();
    return {
      roomCode: 'ABC234',
      hostId: 'host-1',
      status: 'active',
      totalRounds: 3,
      currentRound: 1,
      roundTimeLimit: 20,
      questionOrder: ['q1', 'q2', 'q3'],
      usedQuestionIds: ['q1'],
      currentQuestion: {
        id: 'q1',
        prompt: 'سؤال q1؟',
        options: ['أ', 'ب', 'ج', 'د'],
        difficulty: 'EASY',
        correctIndex: 1,
      },
      questionOpenedAt: openedAt,
      questionDeadlineAt: openedAt + 20_000,
      players: [player('player-1', 'سالم'), player('player-2', 'ريم')],
      lastRoundResult: null,
      createdAt: openedAt,
      updatedAt: openedAt,
      scoringPolicyVersion: 1,
    };
  };

  beforeEach(async () => {
    redis = {
      loadEliminationRoom: jest.fn(),
      saveEliminationRoom: jest.fn(),
      deleteEliminationRoom: jest.fn(),
      addActiveEliminationRoomCode: jest.fn(),
      removeActiveEliminationRoomCode: jest.fn(),
      isEliminationRoomCodeActive: jest.fn().mockResolvedValue(false),
      setEliminationGuestIdentity: jest.fn(),
      getEliminationGuestIdentity: jest.fn(),
      deleteEliminationGuestIdentity: jest.fn(),
      acquireEliminationRoomLock: jest.fn().mockResolvedValue(true),
      releaseEliminationRoomLock: jest.fn().mockResolvedValue(undefined),
      consumeRateLimit: jest.fn().mockResolvedValue(true),
    };
    findManyQuestions = jest
      .fn()
      .mockResolvedValue([
        questionRow('q1', 'EASY', 1),
        questionRow('q2', 'MEDIUM', 0),
        questionRow('q3', 'HARD', 2),
        questionRow('q4', 'HARD', 0),
        questionRow('q5', 'EASY', 3),
      ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EliminationService,
        { provide: RedisService, useValue: redis },
        {
          provide: DatabaseService,
          useValue: {
            client: { question: { findMany: findManyQuestions } },
          },
        },
      ],
    }).compile();

    service = module.get(EliminationService);
  });

  it('يرفض إنشاء الحلقة عندما يكون بنك الأسئلة فارغًا', async () => {
    findManyQuestions.mockResolvedValueOnce([]);
    const result = await service.createRoom(
      { totalRounds: 3, roundTimeLimit: 20 },
      'host-1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NO_QUESTIONS_AVAILABLE');
    }
  });

  it('يرفض إنشاء الحلقة عندما لا تكفي الأسئلة لعدد الجولات', async () => {
    findManyQuestions.mockResolvedValueOnce([questionRow('q1', 'EASY', 0)]);
    const result = await service.createRoom(
      { totalRounds: 5, roundTimeLimit: 20 },
      'host-1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_QUESTIONS_AVAILABLE');
  });

  it('يُخطط سلسلة أسئلة بطول عدد الجولات عند الإنشاء', async () => {
    const result = await service.createRoom(
      { totalRounds: 3, roundTimeLimit: 20 },
      'host-1',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.questionOrder).toHaveLength(3);
      expect(redis.saveEliminationRoom).toHaveBeenCalled();
      expect(redis.addActiveEliminationRoomCode).toHaveBeenCalled();
    }
  });

  it('يُقصي من أخطأ أو لم يجب عند إغلاق الجولة', async () => {
    const room = activeRoom();
    room.players = [
      player('player-1', 'سالم', {
        answer: { optionIndex: 1, answeredAt: 10 },
      }),
      player('player-2', 'ريم', { answer: { optionIndex: 2, answeredAt: 12 } }),
      player('player-3', 'ليلى'),
    ];
    redis.loadEliminationRoom.mockResolvedValue(room);

    const result = await service.endRound('ABC234', 'host-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // بقي ناجٍ واحد فقط → تنتهي الحلقة مباشرة.
      expect(result.room.status).toBe('finished');
      const eliminated = result.room.players.filter((p) => !p.alive);
      expect(eliminated.map((p) => p.id).sort()).toEqual([
        'player-2',
        'player-3',
      ]);
      expect(result.room.lastRoundResult?.correctIndex).toBe(1);
      expect(result.room.lastRoundResult?.eliminatedIds).toHaveLength(2);
    }
  });

  it('يخفي الإجابة الصحيحة في snapshot أثناء الجولة النشطة', () => {
    const room = activeRoom();
    const snapshot = service.buildSnapshot(room, 'player-1', null);
    expect(JSON.stringify(snapshot)).not.toContain('"correctIndex"');
    expect(snapshot.revealedCorrectIndex).toBeNull();
  });

  it('يرفض إجابة ثانية لنفس اللاعب في الجولة نفسها', async () => {
    const room = activeRoom();
    room.players = [
      player('player-1', 'سالم', {
        answer: { optionIndex: 0, answeredAt: 10 },
      }),
    ];
    redis.loadEliminationRoom.mockResolvedValue(room);

    const result = await service.submitAnswer(
      'player-1',
      'ABC234',
      'q1',
      0,
      'sub-1234',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ALREADY_ANSWERED');
  });

  it('يغلق الجولة تلقائيًا حين يجيب كل الأحياء', async () => {
    const room = activeRoom();
    room.players = [player('player-1', 'سالم'), player('player-2', 'ريم')];
    let savedRoom: EliminationRoomRuntime | null = room;
    redis.loadEliminationRoom.mockImplementation(() =>
      Promise.resolve(savedRoom),
    );
    redis.saveEliminationRoom.mockImplementation(
      (_code: string, updated: EliminationRoomRuntime) => {
        savedRoom = updated;
        return Promise.resolve();
      },
    );

    const result = await service.submitAnswer(
      'player-1',
      'ABC234',
      'q1',
      1,
      'sub-aaaa',
    );
    // اللاعب الثاني لم يجب بعد — الجولة تبقى نشطة.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.room.status).toBe('active');

    const second = await service.submitAnswer(
      'player-2',
      'ABC234',
      'q1',
      1,
      'sub-bbbb',
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.room.status).toBe('between');
      expect(second.room.lastRoundResult?.everyoneCorrect).toBe(true);
    }
  });

  it('ينهي الحلقة عند انتهاء الجولات أو بقاء ناجٍ واحد', async () => {
    const room = activeRoom();
    room.currentRound = 3;
    room.totalRounds = 3;
    room.players = [
      player('player-1', 'سالم', { answer: { optionIndex: 1, answeredAt: 5 } }),
    ];
    redis.loadEliminationRoom.mockResolvedValue(room);

    const result = await service.endRound('ABC234', 'host-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.status).toBe('finished');
      expect(result.room.endedAt).toBeDefined();
      const champions = service.resolveChampions(result.room);
      expect(champions.championId).toBe('player-1');
      expect(champions.championName).toBe('سالم');
    }
  });

  it('يعيد ROOM_NOT_FOUND لغرفة غير موجودة', async () => {
    redis.loadEliminationRoom.mockResolvedValue(null);
    const result = await service.startGame('ABC234', 'host-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ROOM_NOT_FOUND');
  });

  it('يرفض بدء الحلقة بأقل من لاعبين', async () => {
    const room = activeRoom();
    room.status = 'waiting';
    room.currentQuestion = null;
    room.players = [player('player-1', 'سالم')];
    redis.loadEliminationRoom.mockResolvedValue(room);

    const result = await service.startGame('ABC234', 'host-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_ENOUGH_PLAYERS');
  });
});
